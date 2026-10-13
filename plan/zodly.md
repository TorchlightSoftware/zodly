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
3. **zodex drops formats written as checks.** zod 4 says a format two ways: as a type of its own (`z.email()`, `z.int()`), or as a check on a string or number (`z.string().email()`, `z.number().int()`), which is what zodly's modifiers make. zodex 4.0.1 keeps the first and drops the second, so `['string', 'email']` serializes as `{"type": "string"}`. Tests in `test/zodly.test.js` pin it for `email`, `uuid`, `url` and `int`. Two ways out, not yet chosen: report it upstream and wait (issue text below), or have zodly build a format modifier on a primitive as zod 4's format type (`['string', 'email']` → `z.email()`), which zod 4 prefers anyway: it marks `.email()` and the other string format methods deprecated, and `.int()` legacy. The second would make the format a base rather than a check: a sixth phase, applied first.

   Upstream issue text:

   > **Formats added as checks are dropped by `zerialize`.** With zod 4.6.7 and zodex 4.0.1, `zerialize(z.email())` is `{type: 'string', kind: 'email'}`, but `zerialize(z.string().email())` is `{type: 'string'}`. The same holds for `z.uuid()`/`.uuid()`, `z.url()`/`.url()` and `z.int()`/`z.number().int()` (`format: 'safeint'`). In zod 4 the method forms add a `string_format`/`number_format` check to `def.checks` rather than setting `def.format`, so a schema written with them round-trips without its format, and accepts values it shouldn't. Expected: both forms serialize the same.

4. **What does MicroQL do with a descriptor that is zodex?** The two can't be told apart reliably. zodex's `{"type": "string"}` is also valid zodly, meaning "an object whose field `type` is a string". So should the caller say which format a schema is in, or should documents be zodex and hand-written schemas zodly, decided by where they appear?
