    {fromZodly: source} takes a value written in the Query and treats it as a descriptor.

Not entirely accurate.  It just takes a zodly definition passed directly in at that location:

    {fromZodly: ['string']}

It's not reading the query or the fields at that point.

    What the plan says it does: it lets "a source reach back into zodly". That means writing a fixed descriptor inside a source, like {union: [['string'], {fromField: 'x'}]}

No.  The example you provided is `fromField` which doesn't have anything to do with zodly.  It's taking the type directly from a field.

I think you're confused because you're reading forms that were designed for MicroQL and are used in service definition.  And you're trying to interpret those in terms of zodly by itself, and lacking context.  Look at current ../microql/services/util.js for examples.

---

    is {fromZodly: ['string']} the meaning you intend

Yes.  fromZodly means you are putting a literal zodly source in.

    {fromZodly: {fromValue: 'schema'}}

Is also valid: it would take whatever was supplied in the "schema" field and apply it as a zodly schema.

    I meant {union: [{fromZodly: ['string']}, {fromField: 'x'}]}

We need to talk more about the dovetail points between the two languages.  zodly is more well thought out and internally consistent, see all the examples in the readme.

For the union example you just mentioned:

1) I don't think the root of the form is valid zodly, it should be an array not an object
2) even if it were an array, then you'd run into the next problem: There are only two interpretations of an object form in zodly right now: A) an object field schema, B) a set of modifiers to a type.

    ['union', ['type', {fromZodly: ['string']}, ['type', {fromField: 'x'}]]]

I originally instructed you that ['type', {}] should be the escape hatch to cross over from zodly into the dynamic type system.  You apparently missed that salient point.  The way that you wrote plan/zodly.md is a giant text wall with no examples and no explanation for the terms and grammar you are using.  So I blame more your former self who wrote that document than I blame your current self who's reading it.

The document is a big pile of mud.

---

    Inside zodly, ['type', {fromZodly: ['string']}] is just ['string']

Yes.  I was just converting your example into valid syntax.  But it's also valid to note that it can be simplified.

    The source language could shrink to:
    - Readers: fromField, fromList, fromObject, fromValue, fromZodly.
    - Operators zodly can't express: difference, pick, merge.

Very good.  Now we're getting to productive conversation.

    util/each's output would become ['array', ['type', {difference: [{fromField: 'service'}, {fromZodly: {fromValue: 'skip'}}]}]].

That strikes me as quite readable.

    the source union drops never and removes duplicate members. Plan errors depend on that, e.g. util/throw returns never and is combined with a catch's type. A zodly union would have to do the same, or describeSchema messages get noisier. Should we drop the three duplicate sources?

Give me an example.

    MicroQL's type tag clashes with zodly's ['type', source]

Well... No, because it's a source, and source has an escape hatch to zodly....  and zodly has an escape hatch to source.  They are two different specs as they are written now.

If we said earlier that you could put a zodly form directly under the 'type' tag, I apologize.  That's not the case.

But considering further...

What if we made all types in zodly implicitly support the 'tags' modifier?  Tags wouldn't actually do anything in terms of validation, but would be read by other programmatic parsers.  Then we could have:

    ['type', {fromField: 'on', tags: ['foo', 'bar', 'baz']}]

And the full input schema could be defined in zodly, with no switching between two contexts.

    {
        out: ['type', {fromField: 'on', tags: ['foo', 'bar', 'baz']}],
        on: ...
    }

---

    A source has exactly one key, and in zodly the objects after a type's arguments are its modifiers

Does that invarient need to hold here?  1) does the form I expressed break the parser/create ambiguity? 2) is it potentially confusing? 3) does it add considerable implementation complexity?

    {tags: [...]} can be shorthand for .meta({tags})

Wouldn't that be:

    {tags: [...]} can be shorthand for {meta: {tags: [...]}}

To preserve zodly syntax?  E.g. tags were already expressable in zodly using the `meta` modifier if I understand you correctly.

    3. Each tag keeps MicroQL's current form, a name or [name, config]. That covers call, whose config is a source for what the nested call receives: ['type', {fromField: 'x'}, {tags: [['call', {fromList: 'on'}]]}].

Hmm...  Ok, so a service field has two types: its input and its output.  The output is fulfilled by 'type' and the input is fulfilled by 'call'.  I'm not sure I want that buried in a tag.  But I'm also not sure I want to create a special syntax accomodation in zodly for it.

What if we reach for the function specification?  Can a zod function describe its inputs and outputs?  And can zodly in turn offer a translation for that?

    ['function', {
        in: ['type', {fromField: 'x'}],
        out: ['type', {fromList: 'on'}]
    }]

    Where does the output go?

input and output are separate zodly schemas.  But: that also leaves the question of how fromField etc. will work for output... maybe the document that output receives is also the input (not the output) because all generic types must refer to the input only?

---

    Yes, it can be ambiguous. pick and merge are both source operators and zod methods on objects

Should we rename them?

I guess I'm not sure we should be having a special "source" form.  I'm not sure these should be different from any other modifier.  It's just that they're only provided to 'type'

    It's somewhat confusing. zodly already has a precedent: ['object', {name: …}, {min: 1}] puts the type's argument in one object and its modifiers in another.

1) you're using object syntax which itself is an exception, as a precedent
2) should we get rid of this syntax and only keep [{name: ...}, {min: 1}] syntax?

    The mixed form would make type the only type whose argument and modifiers share an object.

Argument and modifiers share an object... show me some other examples of types that take arguments?

    That makes {tags} purely a convenience. Do we want it, or should declarations write meta?

I like it.  I think it has value.  And it follows the philosophy of zodly: make common things concise and complex things possible.

    - Use zod's names, input/output, not in/out.

Great, no argument.

    - input is a list of arguments in zod, made into a tuple. A nested call receives one value (@), so it would be input: [['type', {fromList: 'on'}]]. Or zodly accepts a single type and treats it as one argument.

Hmm...  For the first time I think we run into genuinely different interests.  Otto and MicroQL want a single arg, an object document.  Javascript in general is looking for a tuple.  I would say go with the tuple, keep the expressiveness and usefulness.  But wouldn't your example be written as such?

    input: ['tuple', ['type', {fromList: 'on'}]]

I suppose you could collapse that, always take an array without 'tuple'... but doesn't it make the parser more complex?  I don't know.  I don't have an opinion about this either way.  Your form is valid and shorter, just would have to be accomodated in the parser.

    A function schema also checks the nested call while it runs, and that would break on async calls
    The output would have to be ['promise', …], or zodly would wrap it for you

Hmm. What if MicroQL preprocesses the zodex schema?  I could write:

    input: ['type', {fromList: 'on'}]

And this gets wrapped:

    input: ['promise', ['tuple', ['type', {fromList: 'on'}]]]

    I propose that fromField on a function field means its output in both modes

This feels fair to me.

---

    The source keys become a new first phase. It would run before variant in PHASES, because the source creates the schema that the other modifiers act on.

I have been wondering as well: The generic types receive the actual values passed, and then they need to introspect on said values in order to determine concrete type, right?  Is that what they are doing?  Or... are they getting whatever the type system says will be passed in?  e.g. we're looking at the declared type of the input parameters.  This is a question 1) of how microQL is working now, but also 2) does zodly need to work with several shadow documents: [types, values, valueTypes], with each document having the same fields within it, but different sources would pull from the corresponding document, not from just 1.

    - Keep the link to the [util] operations: picked / merged / without.

That's fine.

    Do you want to rename [util]/pick and [util]/merge to match, or keep them?

Keep them, different namespace, no conflict.

    Here are all the types that take arguments

Thanks for the reminder.  Given these examples, I think I see your point and it makes more sense to keep source as a separate argument.

    I'd drop ['object', {shape}] so there's one way to write a shape

Excellent.

    MicroQL's rewrite should wrap output in a promise, not input

Yes of course.

    - zodly needs two new types: promise (takes one type) and function taking {input, output}, a new TAKES kind.

Do we really need to do all this?  I don't think that it really makes a whole lot of sense for zodly itself to be aware of promises.  The service call is a domain boundary: we don't type check services by literally checking the runtime type of the function, we the zodly schema for type inference and composition, and then we test the inputs and outputs of the function at runtime.

But it should be MicroQL that makes this distinction, not zodly or zod.

---

    Sources work from plan-time types, not run-time values

Ah.

    Only when that comes out as any does it fall back to the declared fixed type.

But I think in the new format zodly doesn't have a "fall back" type.  And this is fine?  Old type was redundant?  But... I guess you could have for each source, {fromX, default}.  That would give an explicit way to describe the fallback.

    Source: fromValue
    What it reads: The literal written in the Query at that path, turned into a literal

That's not what this is supposed to mean - it's supposed to mean the runtime value.  This is for cases where said value is itself actually a zodly schema.  It doesn't "only work for literals in the query".

So I want to re-ask the question: is there a sensible way for zodly to provide this abstraction?  Is it an abstraction that would make any sense to consumers of zodly who are not microql?  Or is the dynamic type system something that is better off left in microql, where it lives along side the query and service semantics themselves?

Zodly could simply say that 'type' is reserved by dynamic types, and that these are to be resolved by a preprocessor.  This would let us still use the same final form that we have been discussing, but it would unburden zodly from having to resolve dynamic types.

---

    The declared type of the field a source points at is the fallback, so no {default} is needed

Ok.  I see your point.

    fromValue means the field's value; the planner can only see it when it's written literally
    You're right, and I described it badly.

You're still describing it badly.  Very muddy.  I think I was clear, and I don't see you using the same level of clarity.  Are you contradicting me, or just verbosely agreeing with me?  I can't tell.  If you agree, then drop the verbosity.

    Pass a resolver into zodly's parser rather than preprocessing

I like that.  And I suppose the same can be done for 'function'.

    This is general enough for other users of zodly. For example, ['type', 'Address'] with a resolver that looks up named schemas

Great, I like that.

MicroQL passes a resolver for each case:
    - Planning: resolves against the types and literals it has worked out.
    - Running: returns any, or resolves from the actual values.

Maybe...  I'm not sure what runtime type validation should look like.  If it should happen at all, whether it should be default true or false, and whether it should be configurable.

---

    Rather than a separate resolver for each type, parseSchema takes an option that adds to or replaces entries in zodly's TYPES table

Separate table.  It's still a preprocess step, and doesn't alter zodly's processing of whatever it ends up with.  It just happens with 1 walk of the tree instead of 2.

'type' doesn't need to be reserved any more.  It's not special.  It's just a preprocessor that MicroQL is registering.

Can you show an example of what passing a resolver would look like?  I want to see the call syntax.  I'm expecting I can pass something like:

{
    'type': (form) => form,
    'function': (form) => form,
}

With my example as noops.

    Leave dynamic types unchecked at run time, with no setting for it

Fair.  And validate the concrete types?

---

Hmm... actually let's do reserve 'type' for purposes of user defined dynamic type.  Gives us a slot to document this and ensures that it won't later be shadowed.

    For type to resolve to a zod schema and keep its modifiers, zodly must accept a zod schema in the leading position

Huh?  You're expressing a use case that I don't think is active.  And what if we require ['zod', z.string()] if they want to pass a zod schema?  In any case I don't think MicroQL has any intentions of passing zod, it will all be zodly.

Ok.  Please proceed.  You can write the two plans, and then go ahead and implement these changes both in zodly and in microql.
