# zodly

[zod](https://zod.dev/) schemas written as plain data. A schema you can put in a JSON-like document, write by hand, and read at a glance:

```javascript
import {parseSchema} from 'zodly'

const order = parseSchema({
  customer: {id: ['string', 'uuid'], email: ['string', 'email']},
  items: ['array', [{productId: ['string'], quantity: ['number', 'positive', 'int']}], {min: 1}],
  note: ['string', {max: 500}, 'optional']
})

order.parse(input) // a zod schema, like any other
```

zodly is for schemas that people write: in configuration, in a query, in a service's declaration. zod itself is what runs them, and [zodex](https://www.npmjs.com/package/zodex) is a fuller serialization for tools to store and exchange, 2–4× longer; see [zodly vs zodex](docs/zodly-zodex.md).

```
zodly (written by people) ──parse──▶ zod (runs validation) ◀──dezerialize── zodex (stored, exchanged)
                                        └──────────zerialize─────────▶
```

## Descriptors

A descriptor is one of:

| Descriptor | Is |
|---|---|
| `'string'` | a type name |
| `['string', 'email', {min: 3}]` | a type name, then its modifiers |
| `['array', ['string'], {min: 1}]` | a type name, the types it takes, then its modifiers |
| `{name: ['string']}` | an object schema: each field's descriptor |
| `[{name: ['string']}, 'optional']` | an object schema, boxed, so that it takes modifiers |
| `z.string()` | a zod schema, as it is, anywhere a descriptor goes |

**After a type name, a bare string or object is always a modifier.** A type there is always bracketed, `['string']`, or, for an object schema, boxed, `[{name: ['string']}]`. The one exception is `object`, whose first object is its object schema: `['object', {name: ['string']}]`. So a reader never has to guess what a bare `{…}` means:

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

**Constraints apply before names, wherever they're written**, so `['array', ['string'], 'optional', {min: 2}]` is an optional list of at least two strings: `.min(2)` is called on the list before `.optional()` wraps it.

**A modifier the schema has no method for is refused**, so a misspelling can't pass unnoticed.

## Types

```javascript
// Primitives
['string'] ['number'] ['boolean'] ['date'] ['any'] ['unknown'] ['void'] ['undefined'] ['null'] ['never']
['error']                                        // an error as data (below)

// Lists and records
['array']                                        // a list of anything
['array', ['string']]                            // a list of strings
['array', [{name: ['string']}], {min: 1}]        // a list of objects
['record', ['number']]                           // an object of any keys, each value a number
['record']                                       // values of any type

// Objects
{name: ['string'], age: ['number']}              // an object schema
['object', {name: ['string']}, 'optional']       // the same, with modifiers
[{name: ['string']}, 'optional']                 // the same, boxed
['object', {name: ['string']}, 'loose']          // other fields are allowed too
['object']                                       // any object

// Unions, enums and tuples
['union', ['string'], ['number']]                // a string or a number
['union', [{website: ['string']}], [{name: ['string']}]]
['enum', ['red', 'green', 'blue']]               // one of these values
['tuple', ['string'], ['number']]                // exactly a string, then a number

// Wrappers (the modifiers 'optional' and 'nullable' say the same)
['optional', ['number']]
['nullable', ['string']]
```

An object schema's fields may themselves be object schemas, `{customer: {id: ['string']}}`, or bare type names, `{website: 'string'}`.

## The error type

`error` is an error as data: a [JSON-LD](https://json-ld.org/) node of type `Error`, with an Error's `name` and `message`. Only those three are checked, so whoever produces errors can add fields of its own. By convention `cause` is the error behind it, in the same form:

```javascript
{'@type': 'Error', name: 'TypeError', message: 'not a number', cause: {'@type': 'Error', name: 'Error', message: 'bad input'}}
```

Any error becomes recognisable as one by adding `'@type': 'Error'` to it. It composes like any type: `['error', 'optional']`, `['union', ['error'], ['null']]`, `['array', ['error']]`. It is exported as `errorSchema`. JSON-LD's list form of `@type` (`['Error', 'Thing']`) isn't recognised, since that check can't be serialized through zodex.

## Errors in a descriptor

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
| `parseSchema(descriptor)` | the zod schema a descriptor describes; a zod schema comes back as it is |
| `validate(descriptor, value, show?)` | checks a value, throwing an Error with one line per problem: `- items[0].name: 123 => Invalid input: expected string, received number`. `show` renders the values in those lines (default: JSON). |
| `formatError(zodError, value, show?)` | a zod error as those lines |
| `errorSchema` | the `error` type's zod schema |

zod 4 is a peer dependency.

## What zodly can't say

`literal`, `discriminatedUnion` and `intersection`. For those, write the zod schema in place of a descriptor. Defaults and descriptions are modifiers like any other: `['string', {default: 'none'}]`, `['string', {describe: 'A name'}]`. Regexes and computed values, such as `{min: new Date()}`, can't be written in JSON, and are fixed when the descriptor is written.

## Design

In general we try to map closely to the `zod` API and do minimal processing.  But in a few places we don't mind letting go of "syntax regularity" in order to support less verbosity and a more intuitive API.
