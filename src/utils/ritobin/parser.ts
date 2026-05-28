/* ──────────────────────────────────────────────────────────────────────────
   Ritobin .py (PROP_text) parser & serializer (TypeScript port)
   Lossless round-trip for League .bin files converted to text form.
   ────────────────────────────────────────────────────────────────────────── */

export type Token = {
  type: "LBRACE" | "RBRACE" | "COMMA" | "EQ" | "COLON" | "LBRACK" | "RBRACK"
      | "STRING" | "NUMBER" | "HEX" | "IDENT" | "EOF";
  value: string | null;
  line: number;
  col: number;
};

export type ValueNode =
  | { kind: "string"; value: string }
  | { kind: "number"; value: string }
  | { kind: "hex"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "ident"; value: string }
  | { kind: "null" }
  | { kind: "object"; className: string; fields: BodyNode }
  | { kind: "brace"; value: BodyNode };

export type BodyNode =
  | { kind: "empty" }
  | { kind: "fields"; entries: FieldNode[] }
  | { kind: "map"; entries: MapEntryNode[] }
  | { kind: "list"; items: ValueNode[] };

export type FieldNode = { name: string; type: string; value: ValueNode };
export type MapEntryNode = { key: ValueNode; value: ValueNode };
export type FileNode = { kind: "file"; fields: FieldNode[] };

// ─── Tokenizer ─────────────────────────────────────────────────────────────
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1, col = 1;
  const N = src.length;

  const push = (type: Token["type"], value: string | null) =>
    tokens.push({ type, value, line, col });
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === "\n") { line++; col = 1; } else col++;
      i++;
    }
  };

  while (i < N) {
    const c = src[i];

    if (c === " " || c === "\t" || c === "\r" || c === "\n") { advance(); continue; }
    if (c === "#") { while (i < N && src[i] !== "\n") advance(); continue; }
    if (c === "{") { push("LBRACE", "{"); advance(); continue; }
    if (c === "}") { push("RBRACE", "}"); advance(); continue; }
    if (c === ",") { push("COMMA", ","); advance(); continue; }
    if (c === "=") { push("EQ", "="); advance(); continue; }
    if (c === ":") { push("COLON", ":"); advance(); continue; }
    if (c === "[") { push("LBRACK", "["); advance(); continue; }
    if (c === "]") { push("RBRACK", "]"); advance(); continue; }

    if (c === '"') {
      let str = "";
      advance();
      while (i < N && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < N) {
          const n = src[i + 1];
          const esc: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"' };
          str += esc[n] || n;
          advance(2);
        } else {
          str += src[i];
          advance();
        }
      }
      if (src[i] === '"') advance();
      push("STRING", str);
      continue;
    }

    if (/[\-+0-9]/.test(c)) {
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        let s = "0x";
        advance(2);
        while (i < N && /[0-9a-fA-F]/.test(src[i])) { s += src[i]; advance(); }
        push("HEX", s);
        continue;
      }
      let s = "";
      while (i < N && /[\-+0-9.eE]/.test(src[i])) { s += src[i]; advance(); }
      push("NUMBER", s);
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let s = "";
      while (i < N && /[A-Za-z0-9_]/.test(src[i])) { s += src[i]; advance(); }
      push("IDENT", s);
      continue;
    }

    throw new Error(`Unexpected char '${c}' at line ${line}:${col}`);
  }
  push("EOF", null);
  return tokens;
}

// ─── Parser ────────────────────────────────────────────────────────────────
export function parse(src: string): FileNode {
  const toks = tokenize(src);
  let p = 0;

  const peek = (o = 0): Token => toks[p + o];
  const eat = (type: Token["type"]): Token => {
    const t = toks[p];
    if (t.type !== type) throw new Error(`Expected ${type} at line ${t.line}:${t.col}, got ${t.type} "${t.value}"`);
    p++; return t;
  };
  const accept = (type: Token["type"]): Token | null => {
    if (toks[p].type === type) { p++; return toks[p - 1]; }
    return null;
  };

  function readTypeSig(): string {
    const t = eat("IDENT");
    let sig = t.value as string;
    if (accept("LBRACK")) {
      const inner: string[] = [readTypeSig()];
      while (accept("COMMA")) inner.push(readTypeSig());
      eat("RBRACK");
      sig += "[" + inner.join(",") + "]";
    }
    return sig;
  }

  function readValue(_typeSig?: string): ValueNode {
    const t = peek();

    if (t.type === "STRING") { p++; return { kind: "string", value: t.value as string }; }
    if (t.type === "NUMBER") { p++; return { kind: "number", value: t.value as string }; }
    if (t.type === "HEX") {
      p++;
      if (peek().type === "LBRACE") {
        const body = readBody();
        return { kind: "object", className: t.value as string, fields: body };
      }
      return { kind: "hex", value: t.value as string };
    }
    if (t.type === "LBRACE") {
      return { kind: "brace", value: readBody(_typeSig) };
    }
    if (t.type === "IDENT") {
      const id = t.value as string;
      if (id === "true" || id === "false") { p++; return { kind: "bool", value: id === "true" }; }
      if (id === "null") { p++; return { kind: "null" }; }
      p++;
      if (peek().type === "LBRACE") {
        const body = readBody();
        return { kind: "object", className: id, fields: body };
      }
      return { kind: "ident", value: id };
    }
    throw new Error(`Unexpected token ${t.type} "${t.value}" at line ${t.line}:${t.col}`);
  }

  function readBody(_typeSig?: string): BodyNode {
    eat("LBRACE");
    if (peek().type === "RBRACE") { p++; return { kind: "empty" }; }

    const t0 = peek();
    const t1 = peek(1);

    if ((t0.type === "IDENT" || t0.type === "HEX") && t1.type === "COLON") {
      const fields: FieldNode[] = [];
      while (peek().type !== "RBRACE") fields.push(readNamedField());
      eat("RBRACE");
      return { kind: "fields", entries: fields };
    }

    if ((t0.type === "STRING" || t0.type === "HEX" || t0.type === "NUMBER") && t1.type === "EQ") {
      const entries: MapEntryNode[] = [];
      while (peek().type !== "RBRACE") {
        const keyTok = toks[p++];
        eat("EQ");
        const val = readValue();
        let keyNode: ValueNode;
        if (keyTok.type === "STRING")      keyNode = { kind: "string", value: keyTok.value as string };
        else if (keyTok.type === "HEX")    keyNode = { kind: "hex",    value: keyTok.value as string };
        else                                keyNode = { kind: "number", value: keyTok.value as string };
        entries.push({ key: keyNode, value: val });
      }
      eat("RBRACE");
      return { kind: "map", entries };
    }

    const items: ValueNode[] = [];
    while (peek().type !== "RBRACE") {
      items.push(readValue());
      accept("COMMA");
    }
    eat("RBRACE");
    return { kind: "list", items };
  }

  function readNamedField(): FieldNode {
    const t0 = toks[p];
    let name: string;
    if (t0.type === "IDENT")      { name = t0.value as string; p++; }
    else if (t0.type === "HEX")   { name = t0.value as string; p++; }
    else throw new Error(`Expected field name at line ${t0.line}:${t0.col}, got ${t0.type} "${t0.value}"`);
    eat("COLON");
    const typeSig = readTypeSig();
    eat("EQ");
    const value = readValue(typeSig);
    return { name, type: typeSig, value };
  }

  const fields: FieldNode[] = [];
  while (peek().type !== "EOF") fields.push(readNamedField());
  return { kind: "file", fields };
}

// ─── Serializer ────────────────────────────────────────────────────────────
const indent = (n: number) => "    ".repeat(n);

export function serialize(ast: FileNode): string {
  const out: string[] = ["#PROP_text"];
  for (const f of ast.fields) writeField(out, f, 0);
  return out.join("\n") + "\n";
}

function writeField(out: string[], f: FieldNode, depth: number) {
  out.push(indent(depth) + f.name + ": " + f.type + " = " + writeValue(f.value, depth, f.type));
}

function writeValue(v: ValueNode, depth: number, typeHint?: string): string {
  if (!v) return "null";
  switch (v.kind) {
    case "string": return JSON.stringify(v.value);
    case "number": return v.value;
    case "hex":    return v.value;
    case "bool":   return v.value ? "true" : "false";
    case "ident":  return v.value;
    case "null":   return "null";
    case "object": return v.className + " " + writeBody(v.fields, depth, typeHint);
    case "brace":  return writeBody(v.value, depth, typeHint);
  }
}

function writeBody(body: BodyNode, depth: number, typeHint?: string): string {
  if (!body || body.kind === "empty") return "{}";
  const pad = indent(depth + 1);
  const close = indent(depth) + "}";

  if (body.kind === "fields") {
    const lines: string[] = ["{"];
    for (const f of body.entries)
      lines.push(pad + f.name + ": " + f.type + " = " + writeValue(f.value, depth + 1, f.type));
    lines.push(close);
    return lines.join("\n");
  }
  if (body.kind === "map") {
    const lines: string[] = ["{"];
    for (const e of body.entries) {
      const k = e.key.kind === "string" ? JSON.stringify(e.key.value) : (e.key as any).value;
      lines.push(pad + k + " = " + writeValue(e.value, depth + 1));
    }
    lines.push(close);
    return lines.join("\n");
  }
  if (body.kind === "list") {
    const items = body.items;
    const isVecType = typeHint && (/^vec[234]$/.test(typeHint) || typeHint === "rgba");
    if (isVecType && items.length > 0 && items.length <= 8 &&
        items.every(it => it.kind === "number" || it.kind === "hex")) {
      return "{ " + items.map(it => (it as any).value).join(", ") + " }";
    }
    if (typeHint === "mtx44" && items.length === 16 &&
        items.every(it => it.kind === "number" || it.kind === "hex")) {
      const lines: string[] = ["{"];
      for (let r = 0; r < 4; r++) {
        const row = items.slice(r * 4, r * 4 + 4).map(it => (it as any).value).join(", ");
        lines.push(pad + row);
      }
      lines.push(close);
      return lines.join("\n");
    }
    const lines: string[] = ["{"];
    for (const it of items) {
      let line: string;
      if (it.kind === "brace" && it.value.kind === "list" &&
          it.value.items.every(x => x.kind === "number" || x.kind === "hex") &&
          it.value.items.length > 0 && it.value.items.length <= 8) {
        line = "{ " + it.value.items.map(x => (x as any).value).join(", ") + " }";
      } else {
        line = writeValue(it, depth + 1);
      }
      lines.push(pad + line);
    }
    lines.push(close);
    return lines.join("\n");
  }
  return "{}";
}

// ─── Helpers ───────────────────────────────────────────────────────────────
export function getEntries(ast: FileNode): MapEntryNode[] {
  const out: MapEntryNode[] = [];
  for (const f of ast.fields) {
    if (f.name === "entries" && f.value.kind === "brace" && f.value.value.kind === "map") {
      for (const e of f.value.value.entries) out.push(e);
    }
  }
  return out;
}

export function findField(body: BodyNode | undefined, name: string): FieldNode | null {
  if (!body || body.kind !== "fields") return null;
  return body.entries.find(e => e.name === name) || null;
}
