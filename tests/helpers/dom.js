// A small DOM double for event-driven unit tests; it does not emulate layout.
class Element {
    constructor() {
        this.children = [];
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.style = {};
        this.value = "";
        this.textContent = "";
        this.scrollTop = 0;
        this.classList = new Set();
        this.classList.remove = this.classList.delete.bind(this.classList);
    }
    append(...children) {
        children.forEach(child => { child.parent = this; this.children.push(child); });
    }
    appendChild(child) { this.append(child); return child; }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) {
        this.attributes.delete(name);
        if (name.startsWith("data-")) delete this.dataset[this.dataKey(name)];
    }
    dataKey(name) { return name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
    querySelectorAll(selector) {
        const name = selector.slice(1, -1);
        return this.children.flatMap(child => [
            ...(name.startsWith("data-") && this.dataKey(name) in child.dataset ? [child] : []),
            ...child.querySelectorAll(selector)
        ]);
    }
    insertAdjacentElement(position, element) {
        if (position !== "afterend") throw new Error("Unsupported position");
        element.parent = this.parent;
        this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, element);
    }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    addEventListener(type, listener) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
    }
    dispatchEvent(event) {
        return Promise.all((this.listeners.get(event.type) || []).map(listener => listener(event)));
    }
    focus() {}
}

function createDocument() {
    const elements = new Map();
    return {
        createElement: () => new Element(),
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, Object.assign(new Element(), { id }));
            return elements.get(id);
        }
    };
}

module.exports = { Element, createDocument };
