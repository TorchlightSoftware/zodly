# zodly

[zod](https://zod.dev/) schemas written as JSON serializable data with an elegant syntax.

```javascript
import {parseSchema} from '@tlsft/zodly'

const order = parseSchema({
  customer: {id: ['string', 'uuid'], email: ['string', 'email']},
  items: ['array', [{productId: ['string'], quantity: ['number', 'positive', 'int']}], {min: 1}],
  note: ['string', {max: 500}, 'optional']
})

order.parse(input) // a zod schema, like any other
```

## zodly and zod

`parseSchema` turns a zodly descriptor into an operable zod schema. Currently deserialization from zodly to zod is supported. We're looking at supporting serialization as well, for a subset of zod.

```
zodly ──parseSchema──▶ zod
      ◀── planned ────
```

## Descriptors

A descriptor is one of:

| Descriptor | Is |
|---|---|
| `'string'` | a type name |
| `['string', 'email', {min: 3}]` | a type name, then its modifiers |
| `['array', ['string'], {min: 1}]` | a type name, the types it takes, then its modifiers |
| `{name: ['string']}` | an object schema: each field's descriptor |
| `[{name: ['string']}, 'optional']` | an object schema, boxed, so that it takes modifiers and cannot be confused with being a modifier itself |
| `['zod', z.string(), 'optional']` | a zod schema, named, so that it takes modifiers |
| `z.string()` | a zod schema, as it is, anywhere a descriptor goes |

**After a type name (or object schema), a bare string or object is always a modifier.** A type there is always bracketed, `['string']`, or, for an object schema, boxed, `[{name: ['string']}]`.  So you can determine the meaning of {} by its position in the surrounding [].

```javascript
['array', {min: 2}]                     // a list of anything, at least 2 long
['array', [{min: ['number']}]]          // a list of objects, each with a number `min`
['array', ['string'], {min: 2}]         // a list of strings, at least 2 long
```

## Modifiers

**A modifier is a zod method by name.** `'optional'` calls `.optional()`, `{min: 3}` calls `.min(3)`, and a regex calls `.regex()`. So every zod method is a modifier, with no list to keep up to date:

```javascript
['string', 'email']
['string', {min: 5, max: 100}]
['string', /^[A-Z]/]                    // or {regex: /^[A-Z]/}
['number', 'positive', 'int', 'optional']
['array', ['string'], {nonempty: true}] // a method without an argument, in an object
```

**The order modifiers are written in doesn't matter.** zod applies methods in the order they're called, and some hide others: `.optional()` returns a wrapper with no `.min()`. So zodly applies modifiers by phase:

| Phase | Modifiers | Why here |
|---|---|---|
| 1. variants | `loose`, `strict`, `passthrough`, `strip` | they replace an object schema, so they come before anything kept on it |
| 2. transforms | `trim`, `toLowerCase`, `toUpperCase`, `normalize` | the checks see what they made |
| 3. checks | everything not listed here: `min`, `email`, `int`, regexes, ... | checks commute |
| 4. wrappers | `default`, `prefault`, `catch`, `nullable`, `nullish`, `optional`, `readonly`, in that order | each hides the methods of what it wraps |
| 5. annotations | `describe`, `meta` | they describe the outermost schema, the one you hold |

So `['string', 'optional', {min: 2}, 'trim']` trims first, checks the length, then makes it optional. Note that this disallows a check before a transform: such as checking a raw length and then trimming. Zod can do that, zodly cannot.

**A modifier the schema has no method for is refused**, so a misspelling can't pass unnoticed.

**Tags are names for other programs to read.** `{tags: ['target']}` is shorthand for `{meta: {tags: ['target']}}`; it validates nothing, and `tagsOf(schema)` reads the tags back. Like `meta`, it's an annotation, so it sits on the outermost schema.

## Types

```javascript
// Primitives
['string'] ['number'] ['boolean'] ['date'] ['any'] ['unknown'] ['void'] ['undefined'] ['null'] ['never']
['error']                                        // an error as data (below)
['function']                                     // a function, such as a nested call
['function', {input: ['tuple', ['string']], output: ['number']}]   // its arguments and what it returns, as zod's methods

// Lists and records
['array']                                        // a list of anything
['array', ['string']]                            // a list of strings
['array', [{name: ['string']}], {min: 1}]        // a list of objects
['record', ['number']]                           // an object of any keys, each value a number
['record']                                       // values of any type

// Objects
{name: ['string'], age: ['number']}              // an object schema
[{name: ['string']}, 'optional']                 // the same, boxed, with modifiers
[{name: ['string']}, 'loose']                    // other fields are allowed too
['object']                                       // any object

// Unions, enums and tuples
['union', ['string'], ['number']]                // a string or a number
['union', [{website: ['string']}], [{name: ['string']}]]
['enum', ['red', 'green', 'blue']]               // one of these values
['tuple', ['string'], ['number']]                // exactly a string, then a number

// Wrappers (the modifiers 'optional' and 'nullable' say the same)
['optional', ['number']]
['nullable', ['string']]

// A zod schema, with modifiers
['zod', z.string().length(5), 'optional']
```

An object schema's fields may themselves be object schemas, `{customer: {id: ['string']}}`, or bare type names, `{website: 'string'}`.

## Dynamic types

A dynamic type is one zodly can't know by itself: the schema named `Address`, or, in MicroQL, the type of another field. zodly reserves the type name `type` for them and leaves their meaning to you: a preprocessor, given by type name, rewrites a form before zodly reads it.

```javascript
const schemas = {Address: parseSchema({street: ['string'], city: ['string']})}

const order = parseSchema({
  shipTo: ['type', 'Address'],
  billTo: ['type', 'Address', 'optional']
}, {
  preprocess: {
    type: ([, name, ...modifiers]) => ['zod', schemas[name], ...modifiers]
  }
})
```

- A preprocessor is `(form, path) => form`: it gets the form as written, `['type', 'Address', 'optional']`, and where it sits, `['billTo']`.
- zodly reads what it returns as written at its root, so returning the form is a no-op: `{function: (form) => form}` changes nothing. The descriptors inside it are preprocessed as usual.
- An error a preprocessor throws is reported where its form is, like zodly's own.
- Any type name can have a preprocessor; `type` has no meaning without one, and is refused: `'type' is reserved for dynamic types: parseSchema needs a preprocessor for it`.

## The error type

zod and zodex do not have any canonical way of expressing an error.

zodly's `error` is an error as data: a JSON-LD node of type `Error`, with an Error's `name` and `message`. Only those three are checked; any other field is allowed, so whoever produces errors can add fields of its own. By convention `cause` is the error behind it, in the same form.

```javascript
{'@type': 'Error', name: 'TypeError', message: 'not a number', cause: {'@type': 'Error', name: 'Error', message: 'bad input'}}
```

Using this form, you can make any Error recognizeable by zodly simply by adding `@type: 'Error` to it.

Since zod/zodex have no error type of their own, they would represent this as the underlying object schema:

```json
{
  "type": "object",
  "properties": {
    "@type": {"type": "literal", "values": ["Error"]},
    "name": {"type": "string"},
    "message": {"type": "string"}
  },
  "catchall": {"type": "unknown"}
}
```

Unlike JSON-LD, zodly does not support a list of types (`['Error', 'Thing']`). That's because this is not a serializable form in zodex, and we thought it safer to maintain compatibility than to chase after an edge case.  If you want this: tell us.

## zodly parse errors

A descriptor that can't be read is refused with what each part was read as, and where it sits in the descriptor:

```
Unknown type name 'strng' on ["strng"], at order.items[1]
'string' has an unknown modifier 'optinal' on ["string","optinal"]
'tuple' has an unknown modifier 'a' (a key of the modifier {"a":["string"]}) on ["tuple",{"a":["string"]}]
'array' has the type ["number"] where its modifiers go; the types it takes come right after its name on ["array",["string"],"optional",["number"]]
'union' takes its options first, each a type such as ['string'] on ["union",{"name":["string"]}]
```

## API

| Export | Is |
|---|---|
| `parseSchema(descriptor, {preprocess}?)` | the zod schema a descriptor describes; a zod schema comes back as it is. `preprocess` maps type names to preprocessors ([Dynamic types](#dynamic-types)). |
| `tagsOf(schema)` | the tags written on a schema with `{tags: [...]}`, or none |
| `validate(descriptor, value, show?)` | checks a value, throwing an Error with one line per problem: `- items[0].name: 123 => Invalid input: expected string, received number`. `show` renders the values in those lines (default: JSON). |
| `formatError(zodError, value, show?)` | a zod error as those lines |
| `errorSchema` | the `error` type's zod schema |

zod 4 is a peer dependency.

## What zodly can't say

`literal`, `discriminatedUnion` and `intersection`. For those, write the zod schema in place of a descriptor. Defaults and descriptions are modifiers like any other: `['string', {default: 'none'}]`, `['string', {describe: 'A name'}]`. Regexes and computed values, such as `{min: new Date()}`, can't be written in JSON, and are fixed when the descriptor is written.

## Design

In general we try to map closely to the `zod` API and do minimal processing.  But in a few places we don't mind letting go of "syntax regularity" in order to support less verbosity and a more intuitive API.

## See also

[zodly beside zodex](docs/zodly-zodex.md), a complete serialization of zod, row by row.
