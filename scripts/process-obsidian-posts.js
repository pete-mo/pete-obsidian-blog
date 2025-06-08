const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');

async function processObsidianPosts() {
  const postsDir = path.join('src', 'posts');
  
  try {
    const files = await fs.readdir(postsDir);
    const mdFiles = files.filter(file => file.endsWith('.md'));
    
    for (const file of mdFiles) {
      const filePath = path.join(postsDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const { data: frontmatter, content: bodyContent } = matter(content);
      
      // Process Obsidian wikilinks
      const processedContent = processWikilinks(bodyContent);
      
      // Extract metadata from content
      const metadata = extractContentMetadata(processedContent);
      
      // Update frontmatter with extracted data
      const updatedFrontmatter = {
        ...frontmatter,
        ...metadata,
        slug: frontmatter.slug || generateSlug(frontmatter.title),
        layout: 'post.njk'
      };
      
      // Reconstruct file
      const updatedFile = matter.stringify(processedContent, updatedFrontmatter);
      
      await fs.writeFile(filePath, updatedFile);
      console.log(`Processed: ${file}`);
    }
    
  } catch (error) {
    console.error('Error processing posts:', error);
    process.exit(1);
  }
}

function processWikilinks(content) {
  // Convert [[Internal Link]] to [Internal Link](/internal-link/)
  return content.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
    const slug = generateSlug(linkText);
    return `[${linkText}](/${slug}/)`;
  });
}

function extractContentMetadata(content) {
  const metadata = {};
  
  // Check for code blocks
  metadata.has_code_examples = /```/.test(content);
  
  // Check for images
  metadata.has_images = /!\[.*\]\(.*\)/.test(content) || /<img/.test(content);
  
  // Check for external links
  metadata.has_external_links = /\[.*\]\((https?:\/\/.*)\)/.test(content);
  
  // Extract word count
  const words = content.replace(/[^\w\s]/g, '').split(/\s+/).filter(word => word.length > 0);
  metadata.word_count = words.length;
  
  // Calculate reading time (200 words per minute)
  metadata.estimated_reading_time = Math.ceil(words.length / 200);
  
  return metadata;
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Run if called directly
if (require.main === module) {
  processObsidianPosts();
}

module.exports = { processObsidianPosts };
