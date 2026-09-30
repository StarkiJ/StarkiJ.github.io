const aliasGroups = [
    ["oopmap", "stackmap", "安全点", "引用位置", "栈映射"],
    ["deoptimization", "deopt", "反优化"],
    ["dangling", "悬垂", "uaf", "useafterfree", "释放后使用"],
    ["ssa", "静态单赋值"],
    ["happensbefore", "先行发生"],
    ["false sharing", "伪共享"],
    ["dns", "域名解析"],
    ["weakptr", "弱引用"],
    ["sharedptr", "共享所有权"],
    ["garbage collection", "垃圾回收", "gc"]
];

const normalize = value => value.normalize("NFKC").toLowerCase().replace(/[_-]/g, "").replace(/\s+/g, " ").trim();

export function searchNotes(entries, query) {
    const normalized = normalize(query).slice(0, 200);
    if (!normalized) return [];
    const terms = normalized.split(" ");
    const alternatives = term => aliasGroups.find(group => group.some(alias => normalize(alias) === term)) || [term];
    const phraseAliases = aliasGroups.find(group => group.some(alias => normalize(alias) === normalized));
    const groups = phraseAliases ? [phraseAliases] : terms.map(alternatives);
    return entries.map((entry, order) => {
        const fields = [entry.label, entry.title, entry.trail, entry.description].map(normalize);
        const scores = groups.map(group => Math.max(0, ...group.flatMap(alias => fields.map((field, index) => {
            const term = normalize(alias);
            if (!field.includes(term)) return 0;
            return [12, 6, 3, 1][index] + (field === term ? 8 : 0);
        }))));
        const score = scores.every(Boolean) ? scores.reduce((sum, value) => sum + value, 0) : 0;
        const articleMatch = entry.label === "全文" && fields[1].startsWith(normalized);
        return { entry, order, score: score + (articleMatch ? 20 : 0) };
    }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.order - b.order).map(result => result.entry);
}
