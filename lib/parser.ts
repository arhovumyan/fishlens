import { Parser, Language, type SyntaxNode } from "web-tree-sitter";
import path from "path";

let tsLang: Language;
let tsxLang: Language;
let jsLang: Language;
let ready = false;

async function ensureInit() {
  if (ready) return;

  await Parser.init({
    locateFile(fileName: string) {
      return path.join(
        process.cwd(),
        "node_modules",
        "web-tree-sitter",
        fileName
      );
    },
  });

  const base = process.cwd();
  const resolve = (pkg: string, file: string) =>
    path.join(base, "node_modules", pkg, file);

  tsLang = await Language.load(
    resolve("tree-sitter-typescript", "tree-sitter-typescript.wasm")
  );
  tsxLang = await Language.load(
    resolve("tree-sitter-typescript", "tree-sitter-tsx.wasm")
  );
  jsLang = await Language.load(
    resolve("tree-sitter-javascript", "tree-sitter-javascript.wasm")
  );

  ready = true;
}

function langFor(filePath: string): Language | null {
  if (filePath.endsWith(".tsx")) return tsxLang;
  if (filePath.endsWith(".ts")) return tsLang;
  if (filePath.endsWith(".jsx") || filePath.endsWith(".js")) return jsLang;
  return null;
}

// ---------------------------------------------------------------------------
// AST extraction helpers
// ---------------------------------------------------------------------------

function extractImports(root: SyntaxNode): string[] {
  const out: string[] = [];
  for (const node of root.descendantsOfType("import_statement")) {
    const source = node.childForFieldName("source");
    if (source) {
      // Strip surrounding quotes: "foo" or 'foo' → foo
      out.push(source.text.replace(/^['"]|['"]$/g, ""));
    }
  }
  return out;
}

function extractExports(root: SyntaxNode): string[] {
  const out: string[] = [];

  for (const node of root.descendantsOfType("export_statement")) {
    const decl = node.childForFieldName("declaration");
    if (decl) {
      switch (decl.type) {
        case "function_declaration":
        case "class_declaration":
        case "type_alias_declaration":
        case "interface_declaration": {
          const name = decl.childForFieldName("name");
          if (name) out.push(name.text);
          break;
        }
        case "lexical_declaration":
        case "variable_declaration": {
          for (const vd of decl.descendantsOfType("variable_declarator")) {
            const name = vd.childForFieldName("name");
            if (name) out.push(name.text);
          }
          break;
        }
      }
    }

    // export { a, b, c }
    for (const spec of node.descendantsOfType("export_specifier")) {
      const name = spec.childForFieldName("name");
      if (name) out.push(name.text);
    }

    // export default …
    if (node.children.some((c) => c.type === "default")) {
      // If the declaration has a name (export default function foo), use it
      const name = decl?.childForFieldName("name");
      if (name) {
        // already captured above
      } else {
        out.push("default");
      }
    }
  }

  return out;
}

function extractCalls(body: SyntaxNode): string[] {
  const seen = new Set<string>();
  for (const call of body.descendantsOfType("call_expression")) {
    const fn = call.childForFieldName("function");
    if (fn) seen.add(fn.text);
  }
  return [...seen];
}

function extractFunctions(
  root: SyntaxNode
): Record<string, { calls: string[] }> {
  const out: Record<string, { calls: string[] }> = {};

  // function foo() { … }
  for (const node of root.descendantsOfType("function_declaration")) {
    const name = node.childForFieldName("name");
    if (name) out[name.text] = { calls: extractCalls(node) };
  }

  // const foo = () => { … }  /  const foo = function() { … }
  for (const vd of root.descendantsOfType("variable_declarator")) {
    const value = vd.childForFieldName("value");
    if (value && (value.type === "arrow_function" || value.type === "function")) {
      const name = vd.childForFieldName("name");
      if (name) out[name.text] = { calls: extractCalls(value) };
    }
  }

  // class methods
  for (const node of root.descendantsOfType("method_definition")) {
    const name = node.childForFieldName("name");
    if (name) out[name.text] = { calls: extractCalls(node) };
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FileAnalysis {
  imports: string[];
  exports: string[];
  functions: Record<string, { calls: string[] }>;
}

export async function parseCodebase(
  rawFiles: Record<string, string>
): Promise<Record<string, FileAnalysis>> {
  await ensureInit();

  const parser = new Parser();
  const result: Record<string, FileAnalysis> = {};

  for (const [filePath, source] of Object.entries(rawFiles)) {
    try {
      const lang = langFor(filePath);
      if (!lang) {
        result[filePath] = { imports: [], exports: [], functions: {} };
        continue;
      }

      parser.setLanguage(lang);
      const tree = parser.parse(source);
      if (!tree) {
        result[filePath] = { imports: [], exports: [], functions: {} };
        continue;
      }

      result[filePath] = {
        imports: extractImports(tree.rootNode),
        exports: extractExports(tree.rootNode),
        functions: extractFunctions(tree.rootNode),
      };

      tree.delete();
    } catch (err) {
      console.error(`[parser] Failed to parse ${filePath}:`, err);
      result[filePath] = { imports: [], exports: [], functions: {} };
    }
  }

  parser.delete();
  return result;
}
