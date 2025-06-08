const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const { createClient } = require('@supabase/supabase-js');

module.exports = function(eleventyConfig) {
  // Add syntax highlighting
  eleventyConfig.addPlugin(syntaxHighlight);
  
  // Copy assets
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/gallery/images");
  
  // Enhanced date filter
  eleventyConfig.addFilter("readableDate", dateObj => {
    return new Date(dateObj).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  });

  // Reading time filter
  eleventyConfig.addFilter("readingTime", content => {
    const wordsPerMinute = 200;
    const words = content.split(' ').length;
    return Math.ceil(words / wordsPerMinute);
  });

  // Tag-based collections
  eleventyConfig.addCollection("posts", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/*.md")
      .filter(post => post.data.status === 'published')
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
  });

  eleventyConfig.addCollection("featuredPosts", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/*.md")
      .filter(post => post.data.featured === true && post.data.status === 'published')
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
  });

  // Topic-based collections
  eleventyConfig.addCollection("byTopic", function(collectionApi) {
    const posts = collectionApi.getFilteredByGlob("src/posts/*.md")
      .filter(post => post.data.status === 'published');
    
    const topicMap = {};
    posts.forEach(post => {
      const topic = post.data.primary_topic;
      if (topic) {
        if (!topicMap[topic]) topicMap[topic] = [];
        topicMap[topic].push(post);
      }
    });
    
    return topicMap;
  });

  // Build-time Supabase sync
  eleventyConfig.addTransform("syncToSupabase", async function(content, outputPath) {
    if (outputPath && outputPath.endsWith(".html") && 
        this.inputPath && this.inputPath.includes('/posts/')) {
      
      // Extract post data and sync to Supabase
      await syncPostToSupabase(this.inputPath, this.data, content);
    }
    return content;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};

async function syncPostToSupabase(inputPath, frontmatter, htmlContent) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('Supabase credentials not found, skipping sync');
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Extract text content for embedding
    const textContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Generate embedding (you'll implement this)
    const embedding = await generateEmbedding(textContent);
    
    // Prepare post data
    const postData = {
      slug: frontmatter.slug || frontmatter.title.toLowerCase().replace(/\s+/g, '-'),
      title: frontmatter.title,
      content: textContent,
      summary: frontmatter.summary || '',
      embedding: embedding,
      published_date: frontmatter.date,
      updated_date: frontmatter.updated || frontmatter.date,
      primary_topic: frontmatter.primary_topic || null,
      secondary_topics: frontmatter.secondary_topics || [],
      tags: frontmatter.tags || [],
      content_type: frontmatter.content_type || 'blog_post',
      related_post_slugs: extractRelatedSlugs(frontmatter.related_posts || []),
      prerequisite_concepts: frontmatter.prerequisite_concepts || [],
      builds_upon: frontmatter.builds_upon || [],
      enables: frontmatter.enables || [],
      obsidian_aliases: frontmatter.aliases || [],
      has_code_examples: frontmatter.has_code_examples || false,
      has_images: frontmatter.has_images || false,
      has_external_links: frontmatter.has_external_links || false,
      target_audience: frontmatter.target_audience || 'general',
      difficulty_level: frontmatter.difficulty_level || 3,
      estimated_value: frontmatter.estimated_value || '',
      meta_description: frontmatter.meta_description || '',
      featured_image_url: frontmatter.featured_image || '',
      status: frontmatter.status || 'published',
      featured: frontmatter.featured || false,
      word_count: textContent.split(' ').length,
      reading_time: Math.ceil(textContent.split(' ').length / 200)
    };

    // Upsert to Supabase
    const { error } = await supabase
      .from('blog_posts')
      .upsert(postData, { onConflict: 'slug' });

    if (error) {
      console.error('Supabase sync error:', error);
    } else {
      console.log(`Synced post: ${postData.title}`);
    }
  } catch (error) {
    console.error('Error syncing to Supabase:', error);
  }
}

function extractRelatedSlugs(relatedPosts) {
  // Extract slugs from Obsidian [[wikilinks]]
  return relatedPosts.map(link => {
    if (link.startsWith('[[') && link.endsWith(']]')) {
      return link.slice(2, -2).toLowerCase().replace(/\s+/g, '-');
    }
    return link;
  });
}

async function generateEmbedding(text) {
  // This will be implemented with OpenAI API
  // For now, return null - we'll add this in the next phase
  return null;
}