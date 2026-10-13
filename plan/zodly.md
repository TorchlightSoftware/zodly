# zodly — open items

Status: implemented — the package is split out of microql (`zodly`, a sibling of microql), pending review and its first publish; the items below are still draft

zodly is MicroQL's schema shorthand, now its own package: `['string', 'email', 'optional']`, `{name: ['string']}`, `['array', [{id: ['string']}], {min: 1}]`. Its README has the syntax, and `zodly/docs/zodly-zodex.md` compares it with zodex. MicroQL depends on it for Service Call Validations, Service Schema Validations, the trigger's schema and `util/each`'s `skip`. What's left:

## Generics: `['type', source]` as a zodly type of its own

Beside `['string']`, `{name: ['string']}` and `['array', ['string']]`, a descriptor `['type', source]` would be an escape hatch into MicroQL's source grammar, which says the type is generic: `['array', ['type', {fromList: 'on'}]]`, `{extra: ['type', {fromField: 'with'}, 'optional']}`. Inside the escape hatch an object is a source, not an object schema, so the two never collide; and a source reaches back into zodly through `{fromZodly: source}`, so the grammars nest both ways and the document stays serializable. A document's root is an object, and sources name paths inside it, as MicroQL's field paths do.

This is exactly the `type` tag a MicroQL declaration already writes (`output: [['type', {pick: [{fromField: 'on'}, {fromValue: 'fields'}]}]]`), whose config is already a zodly descriptor or a source (MicroQL 1.1.0), so a declaration's types would become zodly documents rather than a second grammar.

Two interpreters: the plain one resolves `['type', …]` with no bindings, reading `fromField` as the descriptor written at that path and anything else as any, and validates at run time as today; the generic one takes bindings (each field's actual type and literal value, which MicroQL's plan computes) and resolves the sources against them, for static typing. The source grammar (MicroQL's `declaration.js` and `plan.js` `SOURCES`) and its type operators (`types.js`: `union`, `difference`, `pick`, `merge`, `literalOf`, `describedBy`) would move into zodly; MicroQL keeps only what each field is in a given call.

Precedent: zod's generics are TypeScript-only and don't serialize; JSON Schema 2020-12's `$dynamicRef` is the closest serializable relative, and far clumsier to write.

## Unanswered questions

1. **Should zodly gain a serializer (zod → zodly)?** With one, the Builder could show and edit hand-written shorthand that round-trips through zodex. Without one, anything that has been through zodex comes back as zodex. It could also give `error` its name back: zodex serializes `errorSchema` as the loose object it is.
2. **Which gaps should zodly fill?** It can't say `literal`, `discriminatedUnion` or `intersection` (a zod schema stands in for them). Defaults and descriptions are modifiers already: `{default: …}`, `{describe: …}`.
3. **zodex drops `int`.** zodex 4.0.1 serializes `['number', 'int']` as `{"type": "number"}`; a zodly test pins it. Report it upstream.
4. **What does MicroQL do with a descriptor that is zodex?** The two can't be told apart reliably. zodex's `{"type": "string"}` is also valid zodly, meaning "an object whose field `type` is a string". So should the caller say which format a schema is in, or should documents be zodex and hand-written schemas zodly, decided by where they appear?
