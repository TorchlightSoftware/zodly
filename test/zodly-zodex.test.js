/**
 * docs/zodly-zodex.md, checked: every table row whose zodex side is JSON, and
 * every `// zodly` example followed by its JSON, is what zodex makes of the
 * zodly. An example after an `<!-- unchecked -->` line is left alone.
 */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {describe, it} from 'node:test'
import {zerialize} from 'zodex'
import {parseSchema} from '../index.js'

const doc = readFileSync(new URL('../docs/zodly-zodex.md', import.meta.url), 'utf8')

// The doc's zodly is JavaScript, with regexes and single quotes.
const evaluate = (source) => new Function(`return (${source})`)()

const parseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Table rows, `zodly` | `zodex`, where the zodex is JSON.
const rows = [...doc.matchAll(/^\| `(.+?)` \| `(.+?)` \|/gm)]
  .map(([, zodly, zodex]) => [zodly, parseJson(zodex)])
  .filter(([, zodex]) => zodex !== undefined)

// A `// zodly` code block and the JSON block after it: a descriptor, calls
// with validators, or validators written as fields.
const examples = [...doc.matchAll(/(<!-- unchecked -->\n+)?```javascript\n\/\/ zodly[^\n]*\n([\s\S]*?)```\n+```json\n([\s\S]*?)```/g)]
  .filter(([, unchecked]) => !unchecked)
  .map(([, , zodly, zodex]) => [zodly.trim(), JSON.parse(zodex)])

// The validators in an example, those given: each call's precheck and
// postcheck, or validators written as fields (`precheck: …, postcheck: …`).
const given = (validators) => Object.fromEntries(Object.entries(validators).filter(([, v]) => v !== undefined))
const ofCalls = (calls) => calls.map(([, {precheck, postcheck}]) => given({precheck, postcheck}))

// Each validator as the zodex document it serializes to.
const zodexOf = (validators) => Object.fromEntries(Object.entries(validators).map(([key, d]) => [key, zerialize(parseSchema(d))]))

// What an example shows: a list of calls' validators, a call's validators, or
// a fields example's validators; as zodly, then as its JSON. A JSON example
// that is one zodex document is that of the example's one validator.
function shown(zodly, json) {
  if (zodly.startsWith('[')) {
    const calls = ofCalls(evaluate(`[${zodly}]`)).map(zodexOf)
    return Array.isArray(json) ? [calls, ofCalls(json)] : [calls[0], json]
  }
  const validators = zodexOf(given(evaluate(`{${zodly}}`)))
  return [validators, json.type ? {[Object.keys(validators)[0]]: json} : json]
}

describe('docs/zodly-zodex.md', () => {
  it('has rows and examples to check', () => {
    assert.ok(rows.length >= 30, `found ${rows.length} rows`)
    assert.ok(examples.length >= 9, `found ${examples.length} examples`)
  })

  for (const [zodly, zodex] of rows) {
    it(`shows zodex's ${zodly}`, () => {
      assert.deepEqual(zerialize(parseSchema(evaluate(zodly))), zodex)
    })
  }

  for (const [zodly, json] of examples) {
    it(`shows zodex's ${zodly.split('\n')[0]}…`, () => {
      if (zodly.startsWith('{')) return assert.deepEqual(zerialize(parseSchema(evaluate(zodly))), json)
      const [actual, expected] = shown(zodly, json)
      assert.deepEqual(actual, expected)
    })
  }
})
