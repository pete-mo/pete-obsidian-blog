const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { message, conversation_id } = JSON.parse(event.body);
    
    // Generate embedding for the user query
    const queryEmbedding = await generateQueryEmbedding(message);
    
    // Search for relevant content using vector similarity
    const relevantPosts = await searchRelevantContent(queryEmbedding, message);
    
    // Create context-rich prompt
    const contextPrompt = createContextPrompt(message, relevantPosts);
    
    // Get response from Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: contextPrompt
      }]
    });

    // Log the interaction for analytics
    await logChatInteraction(message, response.content[0].text, relevantPosts, conversation_id);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        response: response.content[0].text,
        sources: relevantPosts.map(post => ({
          title: post.title,
          slug: post.slug,
          topic: post.primary_topic
        }))
      })
    };
    
  } catch (error) {
    console.error('Chat error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Sorry, I encountered an error. Please try again.' })
    };
  }
};

async function generateQueryEmbedding(query) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: query,
  });
  return response.data[0].embedding;
}

async function searchRelevantContent(queryEmbedding, query) {
  try {
    // Vector similarity search
    const { data: vectorResults, error: vectorError } = await supabase.rpc(
      'search_posts_by_similarity', 
      {
        query_embedding: queryEmbedding,
        similarity_threshold: 0.7,
        match_count: 5
      }
    );

    if (vectorError) throw vectorError;

    // Keyword search as fallback/supplement
    const { data: keywordResults, error: keywordError } = await supabase
      .from('blog_posts')
      .select(`
        id, title, slug, content, summary, primary_topic, secondary_topics, 
        tags, target_audience, difficulty_level, estimated_value,
        published_date, reading_time
      `)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%,tags.cs.{${query}}`)
      .eq('status', 'published')
      .limit(3);

    if (keywordError) throw keywordError;

    // Combine and deduplicate results
    const allResults = [...vectorResults, ...keywordResults];
    const uniqueResults = allResults.filter((post, index, self) => 
      index === self.findIndex(p => p.id === post.id)
    );

    return uniqueResults.slice(0, 5); // Return top 5 most relevant
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

function createContextPrompt(userQuery, relevantPosts) {
  const context = relevantPosts.map(post => `
**${post.title}** (Topic: ${post.primary_topic}, Difficulty: ${post.difficulty_level}/5)
Summary: ${post.summary || 'No summary available'}
Content Preview: ${post.content.substring(0, 500)}...
URL: /${post.slug}/
  `).join('\n---\n');

  return `You are an AI assistant for a personal blog. Answer the user's question based ONLY on the provided blog content. Be helpful, accurate, and conversational.

User Question: "${userQuery}"

Relevant Blog Content:
${context}

Instructions:
- Answer based only on the provided content
- If the content doesn't fully answer the question, say so and suggest what topics might be helpful
- Include references to specific posts when relevant (use the post titles and URLs)
- Be conversational and helpful
- If asked about topics not covered in the content, politely explain that those topics aren't covered in this blog yet

Response:`;
}

async function logChatInteraction(query, response, sources, conversationId) {
  try {
    await supabase
      .from('chat_interactions')
      .insert({
        query,
        response,
        sources_used: sources.map(s => s.id),
        conversation_id: conversationId || null,
        timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.error('Logging error:', error);
  }
}
