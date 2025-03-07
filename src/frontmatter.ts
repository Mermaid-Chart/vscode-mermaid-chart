import { parseDocument, type Document, YAMLMap, isMap, parse, stringify } from 'yaml';
import { pattern } from './util';


// const frontMatterRegex = /^-{3}\s*[\n\r](.*?[\n\r])-{3}\s*[\n\r]+/s;
const COMMENT_REGEX = /^\s*%%(?!{)[^\n]+\n?/gm;
const DIRECTIVE_REGEX = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
const FIRST_WORD_REGEX = /^\s*(\w+)/;

export const anyCommentRegex = /\s*%%.*\n/gm;

function parseFrontMatterYAML(frontMatterYaml: string): Document<YAMLMap, false> {
    const document: Document = parseDocument(frontMatterYaml);
    if (!isMap(document.contents)) {
      document.contents = new YAMLMap();
    }
    return document as unknown as Document<YAMLMap, false>;
}

function splitFrontMatter(text: string) {
    // Normalize line endings and trim the text
    const normalizedText = text.replace(/\r\n?/g, '\n').trim();
    
    // More flexible regex that handles indentation before front matter
    const frontMatterRegex = /^\s*-{3}[\s\S]*?[\n\r]\s*-{3}/;
    
    const matches = normalizedText.match(frontMatterRegex);
    
    if (!matches) {
        return {
            diagramText: normalizedText,
            frontMatter: '',
        };
    }

    const frontMatter = matches[0]
        .replace(/^\s*---/, '') // Remove opening dashes with any preceding whitespace
        .replace(/\s*---$/, '') // Remove closing dashes with any trailing whitespace
        .trim();

    return {
        diagramText: normalizedText.slice(matches[0].length).trim(),
        frontMatter: frontMatter,
    };
}


/**
 * Ensures the diagram code has an ID field in the frontmatter.
 * @param code The original diagram code.
 * @param diagramId The ID to include in the frontmatter.
 * @returns The updated diagram code.
 */
export function ensureIdField(code: string, diagramId: string): string {
  const { diagramText, frontMatter } = splitFrontMatter(code);
  const document = parseFrontMatterYAML(frontMatter);

  document.contents.set('id', diagramId);

  return `---\n${document.toString()}---\n${diagramText}`;
}


/**
 * Extracts the 'id' field from the YAML frontmatter of the given code.
 * @param code The input code containing YAML frontmatter.
 * @returns The extracted ID, or null if not found.
 */
export function extractIdFromCode(code: string): string | undefined {
    const { frontMatter } = splitFrontMatter(code);
    if (!frontMatter) return undefined; // No frontmatter present

    const document = parseFrontMatterYAML(frontMatter);
    const id = document.contents.get('id');

    return typeof id === 'string' ? id : undefined; // Ensure 'id' is a string
}

const cleanupText = (code: string) => {
  return (
    code
      // parser problems on CRLF ignore all CR and leave LF;;
      .replace(/\r\n?/g, '\n')
      // clean up html tags so that all attributes use single quotes, parser throws error on double quotes
      .replace(
        /<(\w+)([^>]*)>/g,
        (match, tag, attributes) => '<' + tag + attributes.replace(/="([^"]*)"/g, "='$1'") + '>'
      )
  );
};


/**
 * Removes Mermaid-specific directives enclosed in `%%{ ... }%%`.
 * 
 * @param text - The diagram text.
 * @returns The text with directives removed.
 */
export const removeDirectives = function (text: string): string {
  return text.replace(DIRECTIVE_REGEX, '');
};

/**
 * Remove all lines starting with `%%` from the text that don't contain a `%%{`
 * @param text - The text to remove comments from
 * @returns cleaned text
 */
export const cleanupComments = (text: string): string => {
  return text.replace(COMMENT_REGEX, '').trimStart();
};


/**
 * Extracts the first word from a Mermaid diagram after cleaning directives and comments.
 * 
 * @param text - The raw Mermaid diagram text.
 * @returns The first word in lowercase, or an empty string if not found.
 */
export function getFirstWordFromDiagram(text: string): string {
  const cleanedCode = cleanupText(text);
  const { diagramText } = splitFrontMatter(cleanedCode); // Extract diagram text

  const directiveResult = removeDirectives(diagramText);
  const code = cleanupComments(directiveResult);
  
  const match = code.match(FIRST_WORD_REGEX);
  if (match) {
    return match[1].toLowerCase(); // Return the first word in lowercase
  }
  return ''; // Return an empty string if no word is found
}

/**
 * Normalizes Mermaid diagram text by properly formatting the front matter and content.
 * @param code The original diagram code.
 * @returns The normalized diagram code.
 */
export function normalizeMermaidText(code: string): string {
  const { diagramText, frontMatter } = splitFrontMatter(code);
  
  if (!frontMatter) {
    return diagramText;
  }

  // Reconstruct the text with proper formatting
  return `---\n${frontMatter.trim()}\n---\n${diagramText}`;
}
