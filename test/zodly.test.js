import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {z} from 'zod'
import {zerialize, dezerialize} from 'zodex'
import {errorSchema, parseSchema, tagsOf, validate} from '../index.js'

describe('parseSchema', () => {
  // [category, [descriptor, a value that fits, a value that doesn't]]
  const fits = [
    ['primitive types', [
      [['string'], 'hello', 123],
      [['number'], 42, 'hello'],
      [['boolean'], true, 'true'],
      ['string', 'hello', 123],
      [['never', 'optional'], undefined, 'anything']
    ]],
    ['string modifiers', [
      [['string', 'email'], 'test@example.com', 'invalid-email'],
      [['string', 'url'], 'https://example.com', 'not-a-url'],
      [['string', {min: 3, max: 10}], 'hello', 'ab'],
      [['string', /^[A-Z]/], 'Hello', 'hello'],
      [['string', {regex: /^[A-Z]/}], 'Hello', 'hello']
    ]],
    ['number modifiers', [
      [['number', 'positive'], 5, -5],
      [['number', 'int'], 5, 5.5],
      [['number', {min: 0, max: 100}], 50, 150]
    ]],
    ['several modifiers', [
      [['string', 'optional'], undefined, 123],
      [['string', 'nullable'], null, 123],
      [['string', 'optional', 'nullable'], undefined, 123],
      [['string', 'optional', 'nullable'], null, 123],
      [['number', 'positive', 'optional'], 5, -5],
      [['number', 'int', 'nullable'], null, 5.5]
    ]],
    ['modifiers apply by phase, wherever they are written', [
      [['array', ['string'], 'optional', {min: 2}], undefined, ['a']],
      [['array', ['string'], 'optional', {min: 2}], ['a', 'b'], ['a']],
      [['array', ['string'], {min: 2}, 'optional'], undefined, ['a']],
      [['array', ['string'], 'optional', {min: 2}, 'nullable'], null, ['a']],
      [['string', 'optional', {min: 2}], undefined, 'a']
    ]],
    ['arrays', [
      [['array', ['string']], ['a', 'b'], [1, 2]],
      [['array'], [1, 'a'], 'not-array'],
      [['array', {min: 2}], [1, 2], [1]],
      [['array', ['string'], {max: 3}], ['a', 'b'], ['a', 'b', 'c', 'd']],
      [['array', ['string'], {length: 2}], ['a', 'b'], ['a']],
      [['array', ['string'], {nonempty: true}], ['a'], []],
      [['array', ['string'], 'nullable'], null, 'not-array']
    ]],
    ['objects', [
      [{name: ['string'], age: ['number', 'positive']}, {name: 'J', age: 25}, {name: 'J', age: -5}],
      [{website: 'string'}, {website: 'a'}, {}],
      [['object'], {anything: 1}, 'not-object']
    ]],
    ['boxed object schemas', [
      [[{name: ['string']}], {name: 'a'}, {}],
      [[{name: ['string']}, 'optional'], undefined, {}],
      [[{name: ['string']}, 'nullable'], null, 'not-object'],
      [[{text: ['string']}, 'loose'], {text: 'a', extra: 1}, {extra: 1}],
      [['array', [{min: ['string']}]], [{min: 'a'}], [{min: 1}]],
      [['array', [{productId: ['string']}], {min: 1}], [{productId: 'p'}], []],
      [['union', [{website: ['string']}], [{name: ['string']}]], {name: 'a'}, {}]
    ]],
    ['records', [
      [['record', ['number']], {a: 1, b: 2}, {a: 'one'}],
      [['record', ['string', 'nullable'], 'optional'], undefined, {a: 1}],
      [['record'], {a: 'anything'}, 'not-object']
    ]],
    ['unions, enums and tuples', [
      [['union', ['string'], ['number']], 42, true],
      [['union', ['string'], ['number'], 'nullable'], null, true],
      [['union', ['array', ['string']], ['string']], ['a'], 123],
      [['enum', ['red', 'blue', 'green']], 'red', 'yellow'],
      [['enum', ['red', 'blue'], 'optional'], undefined, 'yellow'],
      [['tuple', ['string'], ['number']], ['hello', 42], [42, 'hello']],
      [['tuple', ['string'], ['number'], 'optional'], undefined, [42, 'hello']],
      [['tuple', {}], [], ['a']]
    ]],
    ['wrappers', [
      [['nullable', ['string']], null, 1],
      [['optional', ['number']], undefined, 'a']
    ]],
    ['zod schemas', [
      [z.string().min(5), 'hello', 'hi'],
      [{name: ['string'], email: z.email()}, {name: 'J', email: 'a@b.co'}, {name: 'J', email: 'invalid'}],
      [['array', z.number()], [1], ['a']]
    ]]
  ]

  for (const [category, cases] of fits) {
    describe(category, () => {
      for (const [descriptor, valid, invalid] of cases) {
        it(`reads ${JSON.stringify(descriptor) ?? 'a zod schema'}`, () => {
          const schema = parseSchema(descriptor)
          assert.equal(schema.safeParse(valid).success, true)
          assert.equal(schema.safeParse(invalid).success, false)
        })
      }
    })
  }

  // Every ordering of a list.
  const orderings = (list) => list.length <= 1 ? [list] :
    list.flatMap((item, i) => orderings([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [item, ...rest]))

  // [descriptor's type and types, its modifiers, values to try]
  const unordered = [
    [['string'], ['optional', {min: 2}, 'email'], [undefined, 'a', 'ab@c.de', 'not an email', 3]],
    [['string'], ['trim', {min: 2}, 'nullable'], [' a ', ' ab ', null, undefined]],
    [['array', ['number']], ['optional', {min: 2}, 'nullable', {max: 3}], [undefined, null, [1], [1, 2], [1, 2, 3, 4]]],
    [['number'], ['int', {default: 1}, 'optional', 'positive'], [undefined, 2, 2.5, -1]],
    [[{name: ['string']}], ['optional', 'loose', {describe: 'A person'}], [undefined, {name: 'a', extra: 1}, {}]],
    [['number'], [{tags: ['a']}, 'optional', {describe: 'A count'}], [undefined, 1, 'one']]
  ]

  for (const [typed, modifiers, values] of unordered) {
    it(`reads ${JSON.stringify([...typed, ...modifiers])} the same in every order of its modifiers`, () => {
      const results = (descriptor) => values.map(value => parseSchema(descriptor).safeParse(value)).map(r => [r.success, r.data])
      const [first, ...rest] = orderings(modifiers).map(ordering => results([...typed, ...ordering]))
      for (const result of rest) assert.deepEqual(result, first)
    })
  }

  it('checks what a transform made, wherever the transform is written', () => {
    assert.equal(parseSchema(['string', {min: 2}, 'trim']).safeParse(' a ').success, false)
    assert.equal(parseSchema(['string', {min: 2}, 'trim']).parse(' ab '), 'ab')
    const shown = parseSchema(['string', 'optional', {min: 2}, 'trim'])
    assert.deepEqual([shown.safeParse(' a ').success, shown.parse(' ab '), shown.parse(undefined)], [false, 'ab', undefined])
  })

  it('describes the outermost schema', () => {
    assert.equal(parseSchema(['string', {describe: 'A name'}, 'optional']).description, 'A name')
  })

  it('takes a function, and nothing else, as a function', () => {
    const fn = parseSchema(['function'])
    assert.deepEqual([fn.safeParse(() => 1).success, fn.safeParse({}).success, fn.safeParse('() => 1').success], [true, false, false])
    assert.equal(parseSchema(['function', 'optional']).safeParse(undefined).success, true)
  })

  it('gives a default or a description through modifiers, as zod methods', () => {
    assert.equal(parseSchema(['string', {default: 'none'}]).parse(undefined), 'none')
    assert.equal(parseSchema(['string', {describe: 'A name'}]).description, 'A name')
  })

  it('hands back a zod schema as it is', () => {
    const schema = z.string()
    assert.equal(parseSchema(schema), schema)
  })

  // [description, descriptor, message]
  const refused = [
    ['an unknown type name', ['strng'], /^Unknown type name 'strng' on \["strng"\]$/],
    ['an unknown type name, nested', {order: {items: ['array', ['strng']]}}, /^Unknown type name 'strng' on \["strng"\], at order\.items\[1\]$/],
    ['an unknown modifier', ['string', 'optinal'], /^'string' has an unknown modifier 'optinal' on \["string","optinal"\]$/],
    ['an unknown modifier, as a key', ['number', {minimum: 1}], /^'number' has an unknown modifier 'minimum' \(a key of the modifier \{"minimum":1\}\)/],
    ['an object after a type name, read as a modifier', ['tuple', {a: ['string']}], /^'tuple' has an unknown modifier 'a' \(a key of the modifier \{"a":\["string"\]\}\)/],
    ['a bare type name after a type name, read as a modifier', ['array', 'string'], /^'array' has an unknown modifier 'string' on/],
    ['an unboxed object schema as a union option', ['union', {name: ['string']}], /^'union' takes its options first/],
    ['a regex on a type without one', ['number', /1/], /^'number' can't take the regex \/1\/: it has no regex modifier/],
    ['a type among the modifiers', ['array', ['string'], 'optional', ['number']], /^'array' has the type \["number"\] where its modifiers go/],
    ['a second item type', ['array', ['string'], ['number']], /^'array' has the type \["number"\] where its modifiers go/],
    ['something that is not a modifier', ['string', 5], /^'string' has 5 where its modifiers go; a modifier is a name/],
    ['a wrapper without its type', ['optional'], /^'optional' takes a type first/],
    ['an enum without values', ['enum'], /^'enum' takes a list of values first/],
    ['an enum with no values', ['enum', []], /^'enum' takes a list of values first/],
    ['an array that starts with neither a name nor an object schema', [123, 'modifier'], /^A descriptor array starts with a type name/],
    ['an empty array', [], /^A descriptor array starts with a type name/],
    ['undefined', undefined, /^Not a descriptor/],
    ['null', null, /^Not a descriptor/],
    ['a number in an object schema', {count: 3}, /^Not a descriptor.* on 3, at count$/],
    ['an object schema after \'object\', read as a modifier', ['object', {name: ['string']}], /^'object' has an unknown modifier 'name'/],
    ['\'type\', reserved for dynamic types', {home: ['type', 'Address']}, /^'type' is reserved for dynamic types: parseSchema needs a preprocessor for it on \["type","Address"\], at home$/],
    ['\'type\' as a bare name', 'type', /^'type' is reserved for dynamic types/],
    ['\'zod\' without a zod schema', ['zod', ['string']], /^'zod' takes a zod schema first/],
    ['a malformed function input', ['function', {input: ['strng']}], /^Unknown type name 'strng' on \["strng"\], at \[1\]\.input$/]
  ]

  for (const [description, descriptor, message] of refused) {
    it(`refuses ${description}`, () => {
      assert.throws(() => parseSchema(descriptor), {message})
    })
  }
})

describe('dynamic types, through preprocessors', () => {
  const schemas = {Address: parseSchema({street: ['string']})}
  // A named schema, keeping the form's modifiers.
  const named = {type: ([, name, ...modifiers]) => ['zod', schemas[name], ...modifiers]}

  it('reads \'type\' as its preprocessor says, applying its modifiers as zodly does', () => {
    const schema = parseSchema({home: ['type', 'Address', 'optional']}, {preprocess: named})
    assert.deepEqual([{home: {street: 'a'}}, {}, {home: {street: 1}}].map(value => schema.safeParse(value).success), [true, true, false])
  })

  it('hands the preprocessor the form as written, and where it is', () => {
    const seen = []
    const type = (form, path) => {
      seen.push([form, path])
      return ['any']
    }
    parseSchema({items: ['array', ['type', 'Address', 'optional']]}, {preprocess: {type}})
    assert.deepEqual(seen, [[['type', 'Address', 'optional'], ['items', 1]]])
  })

  it('reads what a preprocessor returns as written, so returning the form is a no-op', () => {
    const fn = parseSchema(['function', 'optional'], {preprocess: {function: (form) => form}})
    assert.deepEqual([fn.safeParse(() => 1).success, fn.safeParse(undefined).success, fn.safeParse(1).success], [true, true, false])
  })

  it('preprocesses the descriptors nested in what a preprocessor returns', () => {
    const preprocess = {...named, function: ([name, signature]) => [name, {input: ['tuple', signature.input]}]}
    const fn = parseSchema(['function', {input: ['type', 'Address']}], {preprocess})
    assert.deepEqual(fn.def.input.def.items.map(item => item.def.type), ['object'])
  })

  it('preprocesses a bare type name', () => {
    assert.equal(parseSchema('type', {preprocess: {type: () => ['string']}}).safeParse('a').success, true)
  })

  it('reports a preprocessor\'s error where its form is', () => {
    const preprocess = {type: () => { throw new Error('No schema named Adress') }}
    assert.throws(() => parseSchema({home: ['type', 'Adress']}, {preprocess}), {message: /^No schema named Adress on \["type","Adress"\], at home$/})
  })
})

describe('the zod type', () => {
  it('takes a zod schema, then modifiers', () => {
    const schema = parseSchema(['zod', z.string().min(2), 'optional'])
    assert.deepEqual(['ab', undefined, 'a'].map(value => schema.safeParse(value).success), [true, true, false])
  })
})

describe('tags', () => {
  it('are meta, read back by tagsOf from the outermost schema', () => {
    const schema = parseSchema(['array', 'optional', {tags: ['target'], describe: 'The list'}])
    assert.deepEqual([tagsOf(schema), schema.description], [['target'], 'The list'])
    assert.deepEqual(parseSchema(['string', {tags: ['a']}]).meta(), {tags: ['a']})
  })

  it('are none on a schema without them', () => {
    assert.deepEqual(tagsOf(parseSchema(['string'])), [])
  })
})

describe('the function type', () => {
  it('takes input and output as zod\'s methods, each a descriptor', () => {
    const fn = parseSchema(['function', {input: ['tuple', ['string']], output: ['number']}])
    assert.deepEqual([fn.def.input.def.type, fn.def.output.def.type], ['tuple', 'number'])
    const length = fn.parse((text) => text.length)
    assert.equal(length('abc'), 3)
    assert.throws(() => length(3))
  })
})

describe('validate', () => {
  // [description, descriptor, a value that fits, a value that doesn't, its message]
  const cases = [
    ['a primitive', ['string'], 'hello', 123, /^- \.: 123 => Invalid input: expected string, received number$/],
    ['an object, by path', {name: ['string'], email: ['string', 'email']}, {name: 'J', email: 'a@b.co'}, {name: 'J', email: 'nope'}, /^- email: "nope" => Invalid email address$/],
    ['a union, by its most helpful option', ['union', [{a: ['string']}], [{b: ['number']}]], {a: 'x'}, {a: 1}, /^- \S+: .* => (?!Invalid input$)/]
  ]

  for (const [description, descriptor, valid, invalid, message] of cases) {
    it(`checks ${description}`, () => {
      assert.doesNotThrow(() => validate(descriptor, valid))
      assert.throws(() => validate(descriptor, invalid), {message})
    })
  }

  it('shows values with the show it is given', () => {
    assert.throws(() => validate(['string'], 123, () => 'shown'), {message: /^- \.: shown =>/})
  })
})

describe('through zodex (docs/zodly-zodex.md)', () => {
  // [descriptor, its zodex document]
  const serialized = [
    [['object'], {type: 'object', properties: {}, catchall: {type: 'unknown'}}],
    [['array', [{name: ['string']}]], {type: 'array', element: {type: 'object', properties: {name: {type: 'string'}}}}],
    [['record', ['number']], {type: 'record', key: {type: 'string'}, value: {type: 'number'}}]
  ]

  // zod 4 says a format two ways: as a type of its own (z.email()), or as a
  // check on a string or number (z.string().email()), which is what zodly's
  // modifiers make. zodex 4.0.1 keeps the first and drops the second: an
  // upstream gap, pinned so that a fix shows here.
  // [the format as a type, as a check, what zodex keeps of the type]
  const formats = [
    [z.email(), z.string().email(), {type: 'string', kind: 'email'}],
    [z.uuid(), z.string().uuid(), {type: 'string', kind: 'uuid'}],
    [z.url(), z.string().url(), {type: 'string', kind: 'url'}],
    [z.int(), z.number().int(), {type: 'number', format: 'safeint'}]
  ]

  for (const [asType, asCheck, kept] of formats) {
    it(`keeps ${asType.def.format} as a type, and drops it as a check`, () => {
      assert.deepEqual(zerialize(asType), kept)
      assert.deepEqual(zerialize(asCheck), {type: kept.type})
    })
  }

  for (const [descriptor, document] of serialized) {
    it(`serializes ${JSON.stringify(descriptor)}`, () => {
      assert.deepEqual(zerialize(parseSchema(descriptor)), document)
    })
  }
})

describe('the error type', () => {
  // [value, whether it is an error as data]
  const recognised = [
    [{'@type': 'Error', name: 'Error', message: 'm'}, true],
    [{'@type': 'Error', name: 'Error', message: 'm', status: 503, '@id': 'urn:x'}, true],
    [{'@type': 'Error', message: 'm'}, false],
    [{'@type': ['Error'], name: 'Error', message: 'm'}, false],
    [{'@type': 'Organization', name: 'Acme', message: 'hello'}, false],
    [new Error('live'), false],
    [null, false]
  ]

  it('is errorSchema, by name, and composes like any type', () => {
    assert.equal(parseSchema(['error']), errorSchema)
    assert.equal(parseSchema('error'), errorSchema)
    assert.equal(parseSchema(['error', 'optional']).safeParse(undefined).success, true)
  })

  for (const [value, expected] of recognised) {
    it(`${expected ? 'recognises' : 'doesn\'t take'} ${JSON.stringify(value) ?? String(value)}`, () => {
      assert.equal(errorSchema.safeParse(value).success, expected)
    })
  }

  it('serializes through zodex as the object it is (docs/zodly-zodex.md § Error Declaration)', () => {
    assert.deepEqual(zerialize(errorSchema), {
      type: 'object',
      properties: {
        '@type': {type: 'literal', values: ['Error']},
        name: {type: 'string'},
        message: {type: 'string'}
      },
      catchall: {type: 'unknown'}
    })
  })

  it('round-trips through zodex, recognising the same values', () => {
    const revived = dezerialize(zerialize(errorSchema))
    for (const [value, expected] of recognised) assert.equal(revived.safeParse(value).success, expected)
  })
})
