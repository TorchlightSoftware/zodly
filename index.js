/**
 * @fileoverview zodly — zod schemas written as plain data, parsed into zod.
 *
 * A descriptor is one of:
 *
 *   'string'                          a type name
 *   ['string', 'email', {min: 3}]     a type name, then its modifiers
 *   ['array', ['string'], {min: 1}]   a type name, the types it takes, then its modifiers
 *   {name: ['string']}                an object schema: each field's descriptor
 *   [{name: ['string']}, 'optional']  an object schema, boxed so that it takes modifiers
 *   z.string()                        a zod schema, as it is
 *
 * After a type name, a bare string or object is always a modifier: a zod
 * method by name ('optional' calls .optional(), {min: 3} calls .min(3)), and
 * a regex calls .regex(). A type there is always bracketed (['string']) or
 * boxed ([{name: ['string']}]). The one exception is 'object', whose first
 * object is its object schema: ['object', {name: ['string']}].
 */

import {z} from 'zod'

/**
 * An error as data: a JSON-LD node of type Error, with an Error's name and
 * message, and any other fields — `cause`, by convention, is the error
 * behind it, in the same form:
 *
 *   {'@type': 'Error', name: 'TypeError', message: 'not a number', cause: {...}}
 *
 * Only `@type`, `name` and `message` are checked, so whoever produces errors
 * may add fields of its own. `@type` is the string 'Error'; JSON-LD's list
 * form isn't recognised, since its check can't be serialized.
 */
export const errorSchema = z.looseObject({
  '@type': z.literal('Error'),
  name: z.string(),
  message: z.string()
})

const PRIMITIVES = ['string', 'number', 'boolean', 'date', 'any', 'unknown', 'void', 'undefined', 'null', 'never']

/**
 * The types, by name: what each takes between its name and its modifiers,
 * and the schema it builds from that.
 *   item     a type, if one is given: a list's items, a record's values
 *   inner    one type, to wrap
 *   options  one type or more: a union's
 *   items    any number of types: a tuple's
 *   values   a list of strings: an enum's
 *   shape    an object schema, if one is given: an object's fields
 */
const TYPES = {
  ...Object.fromEntries(PRIMITIVES.map(name => [name, {build: () => z[name]()}])),
  error: {build: () => errorSchema},
  array: {takes: 'item', build: (item = z.any()) => z.array(item)},
  record: {takes: 'item', build: (value = z.any()) => z.record(z.string(), value)},
  optional: {takes: 'inner', build: (inner) => z.optional(inner)},
  nullable: {takes: 'inner', build: (inner) => z.nullable(inner)},
  union: {takes: 'options', build: (options) => z.union(options)},
  tuple: {takes: 'items', build: (items) => z.tuple(items)},
  enum: {takes: 'values', build: (values) => z.enum(values)},
  object: {takes: 'shape', build: (shape) => shape ? z.object(shape) : z.looseObject({})}
}

const isPlainObject = (value) => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

// What may stand where a type is taken: a bracketed or boxed descriptor, or a zod schema.
const isType = (arg) => Array.isArray(arg) || arg instanceof z.ZodType

const isModifier = (arg) => typeof arg === 'string' || isPlainObject(arg) || arg instanceof RegExp

// A descriptor as text, for messages: zod schemas and regexes shown by kind.
const show = (descriptor) => JSON.stringify(descriptor, (_, value) =>
  value instanceof z.ZodType ? `<zod ${value.def.type}>` : value instanceof RegExp ? String(value) : value) ?? String(descriptor)

// A path as text: `.` for the root, else like `items[0].name`.
const pathText = (path) => path.length === 0 ? '.' : path.map((segment, index) =>
  typeof segment === 'number' ? `[${segment}]` : index === 0 ? segment : `.${segment}`).join('')

// A descriptor that can't be read, with what was wrong, where it is in the
// root descriptor.
function refuse(problem, descriptor, path) {
  throw new Error(`${problem} on ${show(descriptor)}${path.length ? `, at ${pathText(path)}` : ''}`)
}

const leadingTypes = (args) => {
  const count = args.findIndex(arg => !isType(arg))
  return count === -1 ? args.length : count
}

/**
 * Reads what a type takes from the front of its arguments: the arguments for
 * its build, and how many of its arguments that used. `at(i)` parses the
 * i-th argument as a descriptor; `shapeAt(i)` as an object schema.
 */
const TAKES = {
  none: () => [[], 0],
  item: ({args, at}) => isType(args[0]) ? [[at(0)], 1] : [[], 0],
  inner: ({args, at, fail}) => isType(args[0]) ? [[at(0)], 1] : fail('takes a type first, such as [\'string\']'),
  options: ({args, at, fail}) => {
    const count = leadingTypes(args)
    return count ? [[args.slice(0, count).map((_, i) => at(i))], count] : fail('takes its options first, each a type such as [\'string\']')
  },
  items: ({args, at}) => {
    const count = leadingTypes(args)
    return [[args.slice(0, count).map((_, i) => at(i))], count]
  },
  values: ({args, fail}) => {
    const [values] = args
    const listed = Array.isArray(values) && values.length > 0 && values.every(value => typeof value === 'string')
    return listed ? [[values], 1] : fail('takes a list of values first, such as [\'red\', \'blue\']')
  },
  shape: ({args, shapeAt}) => isPlainObject(args[0]) ? [[shapeAt(0)], 1] : [[], 0]
}

// A modifier applied to a schema: the zod method it names, with its argument.
function applyModifier(schema, name, args, refuseHere) {
  if (typeof schema[name] !== 'function') refuseHere(name)
  return schema[name](...args)
}

/**
 * A schema with its modifiers applied. Constraints (objects and regexes)
 * apply before names, wherever they're written, so that ['array', 'optional',
 * {min: 1}] is an optional list of at least one item.
 */
function applyModifiers(schema, modifiers, fail) {
  const misplaced = modifiers.find(modifier => !isModifier(modifier))
  if (misplaced !== undefined) {
    fail(isType(misplaced)
      ? `has the type ${show(misplaced)} where its modifiers go; the types it takes come right after its name`
      : `has ${show(misplaced)} where its modifiers go; a modifier is a name ('optional'), an object ({min: 1}) or a regex`)
  }
  const constraints = modifiers.filter(modifier => typeof modifier !== 'string')
  const names = modifiers.filter(modifier => typeof modifier === 'string')
  const constrained = constraints.reduce((current, constraint) => constraint instanceof RegExp
    ? applyModifier(current, 'regex', [constraint], () => fail(`can't take the regex ${constraint}: it has no regex modifier`))
    : Object.entries(constraint).reduce((s, [name, value]) =>
      applyModifier(s, name, name === 'nonempty' && value === true ? [] : [value],
        () => fail(`has an unknown modifier '${name}' (a key of the modifier ${show(constraint)})`)), current), schema)
  return names.reduce((current, name) => applyModifier(current, name, [], () => fail(`has an unknown modifier '${name}'`)), constrained)
}

// A type name with its arguments, which start at `offset` in the descriptor.
function parseTyped(name, args, offset, descriptor, path) {
  const fail = (problem) => refuse(`'${name}' ${problem}`, descriptor, path)
  if (!Object.hasOwn(TYPES, name)) refuse(`Unknown type name '${name}'`, descriptor, path)
  const {takes = 'none', build} = TYPES[name]
  const at = (i) => parse(args[i], [...path, offset + i])
  const shapeAt = (i) => parseShape(args[i], [...path, offset + i])
  const [built, used] = TAKES[takes]({args, at, shapeAt, fail})
  return applyModifiers(build(...built), args.slice(used), fail)
}

// An object schema's fields, each parsed as a descriptor.
const parseShape = (shape, path) =>
  Object.fromEntries(Object.entries(shape).map(([field, descriptor]) => [field, parse(descriptor, [...path, field])]))

function parse(descriptor, path) {
  if (descriptor instanceof z.ZodType) return descriptor
  if (typeof descriptor === 'string') return parseTyped(descriptor, [], 1, descriptor, path)
  if (isPlainObject(descriptor)) return z.object(parseShape(descriptor, path))
  if (!Array.isArray(descriptor)) {
    refuse('Not a descriptor: a descriptor is a type name (\'string\'), an array starting with one ([\'string\', \'email\']), an object schema ({name: [\'string\']}) or a zod schema', descriptor, path)
  }
  const [first, ...rest] = descriptor
  if (typeof first === 'string') return parseTyped(first, rest, 1, descriptor, path)
  if (isPlainObject(first)) return parseTyped('object', descriptor, 0, descriptor, path)
  refuse('A descriptor array starts with a type name (\'string\') or a boxed object schema ([{name: [\'string\']}])', descriptor, path)
}

/**
 * The zod schema a descriptor describes. A descriptor that can't be read is
 * refused with what was wrong and where, inside the descriptor, it is.
 */
export const parseSchema = (descriptor) => parse(descriptor, [])

// How a value is shown in a validation message when the caller gives no `show`.
const showAsJson = (value) => JSON.stringify(value)

const valueAt = (value, path) => path.reduce((current, segment) => current?.[segment], value)

// The most helpful message in a union's failure: the first of its options'
// that says more than 'Invalid input'.
const unionMessage = (issue) =>
  issue.errors.flat().find(sub => sub.message && sub.message !== 'Invalid input')?.message ?? issue.message

/**
 * A zod error as text: one line per issue, with its path and the value found
 * there, rendered by `show`.
 */
export function formatError(zodError, value, show = showAsJson) {
  return zodError.issues.map(issue => {
    const path = issue.path ?? []
    const message = issue.code === 'invalid_union' && issue.errors ? unionMessage(issue) : issue.message
    return `- ${pathText(path)}: ${show(valueAt(value, path))} => ${message}`
  }).join('\n')
}

/**
 * Checks a value against a descriptor (or zod schema), throwing an Error whose
 * message is formatError's when it doesn't fit.
 */
export function validate(descriptor, value, show) {
  if (!descriptor) return
  const result = parseSchema(descriptor).safeParse(value)
  if (!result.success) throw new Error(formatError(result.error, value, show))
}
