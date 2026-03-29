We can take the hierarchy map and use it as a UI for driving the test harness on test.html

Beyond its current controls it needs a way to send messages.
For basic parent and child messages, we could use buttons like the icons we already have for representing these messages.

So these buttons could be on the document header. And they'd just send generic default messages.

So specifically on a child document there'd be:
`[p->self]` and `[self->p]` buttons.

Every document would have a `[self]` button.

Supporting the openers and opened seems harder.
When the "open tab" button is pushed on a document, this could record the opener for this new tab. We'd need to show this somehow, we can just show this as an "opener" with the document id.
If we show an opener field in the header of documents, then this field could have the buttons `[self->opener]` and `[opener->self]`.