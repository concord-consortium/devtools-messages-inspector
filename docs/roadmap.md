# Remaining for Version 1
- in the new FrameActionButton the "frame" is passed in as two props. It should be an object. This is an confusing area. This should probably be called a source since we're calling all of the things that can send and receive messages "sources". A better name would be "endpoints". Or the long version MessageEndpoint. For the data coming from the context script sourceId might still be best because this really is the id assigned to this particular source relative to the window that received the message. But once this gets into the Panel (and possibly the background too) it now represents a common thing that might send messages to different frames. Because of that it might have multiple sourceIds. We aren't using "frame" for this because we are assuming we'll support messages from webworkers. However it isn't clear if we can even identify those message sources. But I think there has to be a way. So we should start with verifying that.
- it seems like the "sources/endpoints" pane and "focused frame" should really be displaying documents instead of frames. The messages come from documents, and if the frame is navigated a new document will be created. In the focused frame view, part of the point is to see which messages the focused thing knows about. If the frame is navigated, the current document will know about some of them but not others. This approach seems like it could cause many problems but is more accurate. It also means the hierarchy (parents...) also needs to be about documents.
- it will be useful if we can record a "session" of messages/events between the panel and the background. Then we can setup the panel with specific settings and then replay the session. This might help reproduce issues that only show up in the real extension within the test harness environment. This has a few questions though: when does the session start recording? How is the session recording enabled? Should we also record any settings or other chrome calls made by the panel?
- add indentation to show hierarchy level in table
- add lines showing hierarchy in table
- see if we can add iframe elements to console when clicked on in hierarchy
- see if we can show the iframe element in the elements tab from the hierarchy
  - Use `chrome.devtools.inspectedWindow.eval('inspect(element)')` where `inspect()` is a DevTools console helper that switches to Elements panel and selects the element
  - Challenge: need to get a reference to the iframe element; could use a selector or store references in injected.js
  - For cross-origin: the iframe element itself is in the parent frame, so this should work even though iframe contents are cross-origin
- see if we can add an option to a context menu in the elements tab to hierarchy view
- figure out how to make the hierarchy table more advanced:
  - resizable columns
  - sortable columns (how do we deal with hierarchy view)
- add opened tabs to the hierarchy
- fix table column resize handles they are hard to select
- update details pane in messages view, probably details should be default and first and content second
- the pane on right right that comes out doesn't behave correctly on resize

- truncate long values in the context pane with some way to see the full value.
- clean up the left side
- show opened windows in the hierarchy
- unknown openers (no openedTabs mapping) don't get a Frame in FrameStore because Frame requires numeric tabId/frameId. To support them, Frame would need to work without tab/frame IDs.


- update documentation on matching up iframes with frameIds, the issue linked in the doc is nuanced. It sounds like it will not be fixed for a while, but perhaps a new issue that provides the documentId would be something better.
- improve UI to better match the rest of the dev tools styling
- show a banner when the extension is reloaded/updated while the panel is open, telling the user to reopen DevTools
- update frame id syntax so it is more liqe friendly, perhaps just tX.fY

# Test Harness Separation
- separate out the test harness into its own repository. If we have a pattern in place that validates each part of the harness with a real extension that we can run with playwright, then this should be a maintainable project that others could add new features to. And the automated tests will verify that it is behaving the same as the real world.
- automatic verification of the test harness: create a new extension that can be run inside of playwright. Then have a test set of webpages, that playwright can drive to generate the same events and behavior as the test-harness. This verification can be run in GitHub actions to make sure new versions of Chrome behave the same way as what we are expecting.

# Version 1.1
- import button

# Version 2
- add timing view: a sequence diagram with one row per frame, x axis can be based on time, we'll need scaling.
- add load information for each frame
- add invasive option which overrides postMessage in the calling window. This should allow the extension to capture lost messages, and look at the timing
- see what we can do about web worker messages
- add support for message channels see the [message channel plan](plans/2026-02-23-message-channel-design.md)
