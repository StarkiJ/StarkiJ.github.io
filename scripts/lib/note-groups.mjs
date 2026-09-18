export function noteGroups(category, kinds) {
    if (!category.groups) {
        return Object.entries(kinds).map(([kind, title]) => ({
            title,
            notes: category.notes.filter(note => note.kind === kind)
        })).filter(group => group.notes.length);
    }
    const bySlug = new Map(category.notes.map(note => [note.slug, note]));
    const assigned = new Set();
    const groups = category.groups.map(group => {
        if (!group.title || !Array.isArray(group.notes) || !group.notes.length) {
            throw new Error(`Incomplete note group in ${category.id}`);
        }
        return {
            title: group.title,
            notes: group.notes.map(slug => {
                if (!bySlug.has(slug) || assigned.has(slug)) {
                    throw new Error(`Unknown or repeated grouped note: ${slug}`);
                }
                assigned.add(slug);
                return bySlug.get(slug);
            })
        };
    });
    if (assigned.size !== bySlug.size) throw new Error(`Ungrouped notes in ${category.id}`);
    return groups;
}
