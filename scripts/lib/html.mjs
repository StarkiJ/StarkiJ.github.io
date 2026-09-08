// Static source inspection for this site's explicitly closed HTML.
// This is not an HTML5 browser parser and does not perform error recovery or layout.
const voidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

export function decodeHtml(value) {
    return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
        if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
        const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "\ufffd";
    });
}

export function parseHtml(source) {
    const root = { tag: "#document", children: [] };
    const stack = [root];
    const nodes = [];
    const errors = [];
    const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*>/g;
    for (let match; (match = tokens.exec(source));) {
        const token = match[0];
        if (token.startsWith("<!")) continue;
        const tag = token.match(/^<\/?([\w:-]+)/)[1].toLowerCase();
        if (token.startsWith("</")) {
            if (stack.at(-1).tag !== tag) {
                errors.push(`Unexpected </${tag}> after <${stack.at(-1).tag}>`);
                continue;
            }
            const node = stack.pop();
            node.contentEnd = match.index;
            node.end = tokens.lastIndex;
            continue;
        }
        const attributes = {};
        const attributeSource = token.slice(tag.length + 1).replace(/\/?\s*>$/, "");
        for (const attribute of attributeSource.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
            const name = attribute[1].toLowerCase();
            if (name in attributes) errors.push(`Duplicate attribute ${name} on <${tag}>`);
            attributes[name] = decodeHtml(attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
        }
        const node = { tag, attributes, children: [], parent: stack.at(-1), start: match.index, contentStart: tokens.lastIndex };
        node.parent.children.push(node);
        nodes.push(node);
        if (!voidTags.has(tag) && !/\/\s*>$/.test(token)) {
            stack.push(node);
            if (["script", "style", "textarea", "title"].includes(tag)) {
                const closing = new RegExp(`</${tag}\\s*>`, "gi");
                closing.lastIndex = tokens.lastIndex;
                const end = closing.exec(source);
                tokens.lastIndex = end ? end.index : source.length;
            }
        }
    }
    if (stack.length > 1) errors.push(`Unclosed elements: ${stack.slice(1).map(node => node.tag).join(", ")}`);
    return { nodes, errors, codeText: node => decodeHtml(source.slice(node.contentStart, node.contentEnd)) };
}
