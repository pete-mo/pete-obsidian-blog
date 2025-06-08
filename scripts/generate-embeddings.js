const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function generateEmbeddings() {
  try {
    // Get posts without embeddings
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .is('embedding', null);

    if (error) throw error;

    console.log(`Generating embeddings for ${posts.length} posts...`);

    for (const post of posts) {
      console.log(`Processing: ${post.title}`);
      
      // Create comprehensive text for embedding
      const embeddingText = createEmbeddingText(post);
      
      // Generate embedding
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: embeddingText,
      });

      const embedding = response.data[0].embedding;

      // Update post with embedding
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({ embedding })
        .eq('id', post.id);

      if (updateError) {
        console.error(`Error updating ${post.title}:`, updateError);
      } else {
        console.log(`✓ Generated embedding for: ${post.title}`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Embedding generation complete!');
  } catch (error) {
    console.error('Error generating embeddings:', error);
  }
}

function createEmbeddingText(post) {
  // Create rich context for better RAG performance
  const parts = [
    `Title: ${post.title}`,
    post.summary ? `Summary: ${post.summary}` : '',
    `Topic: ${post.primary_topic}`,
    post.secondary_topics?.length ? `Subtopics: ${post.secondary_topics.join(', ')}` : '',
    post.tags?.length ? `Tags: ${post.tags.join(', ')}` : '',
    post.target_audience ? `Audience: ${post.target_audience}` : '',
    post.prerequisite_concepts?.length ? `Prerequisites: ${post.prerequisite_concepts.join(', ')}` : '',
    post.estimated_value ? `Value: ${post.estimated_value}` : '',
    `Content: ${post.content}`
  ];

  return parts.filter(Boolean).join('\n\n');
}

// Export for use in build process
module.exports = { generateEmbeddings, createEmbeddingText };

// Run if called directly
if (require.main === module) {
  generateEmbeddings();
}