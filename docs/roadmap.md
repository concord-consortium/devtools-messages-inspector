# Remaining for Version 1
- add 'focusedFrame' (or something like that) to messages view. this would be a pull down menu that lets you choose a frame (kind of like in the console tab). If this is selected only messages going to and from this frame are shown. And there are icons indicating if a message is going into this frame or out of it. We'll have to think about these icons so they are different than the ones currently used for the sourceType
- add links between hierarchy and messages view: 
  - focus the current frame
  - filter messages by some property of a frame
  - open the frame info in the hierarchy from a link in messages
- add indentation to show hierarchy level in table
- add lines showing hierarchy in table
- see if we can add iframe elements to console when clicked on in hierarchy
- see if we can show the iframe element in the elements tab from the hierarchy
  - Use `chrome.devtools.inspectedWindow.eval('inspect(element)')` where `inspect()` is a DevTools console helper that switches to Elements panel and selects the element
  - Challenge: need to get a reference to the iframe element; could use a selector or store references in injected.js
  - For cross-origin: the iframe element itself is in the parent frame, so this should work even though iframe contents are cross-origin
- see if we can add an option to a context menu in the elements tab to hierarchy view
- allow the user to filter on every column in the table
- figure out how to make the hierarchy table more advanced:
  - resizable columns
  - sortable columns (how do we deal with hierarchy view)

- truncate long values in the context pane with some way to see the full value.
- figure out what I can do to prevent other people from releasing copies that steal users information.
- clean up the left side
- show opened windows in the hierarchy
- unknown openers (no openedTabs mapping) don't get a Frame in FrameStore because Frame requires numeric tabId/frameId. To support them, Frame would need to work without tab/frame IDs.


- update documentation on matching up iframes with frameIds, the issue linked in the doc is nuanced. It sounds like it will not be fixed for a while, but perhaps a new issue that provides the documentId would be something better.
- improve UI to better match the rest of the dev tools styling


# Test Harness Separation
- separate out the test harness into its own repository. If we have a pattern in place that validates each part of the harness with a real extension that we can run with playwright, then this should be a maintainable project that others could add new features to. And the automated tests will verify that it is behaving the same as the real world.
- automatic verification of the test harness: create a new extension that can be run inside of playwright. Then have a test set of webpages, that playwright can drive to generate the same events and behavior as the test-harness. This verification can be run in GitHub actions to make sure new versions of Chrome behave the same way as what we are expecting.

# Version 2
- add timing view: a sequence diagram with one row per frame, x axis can be based on time, we'll need scaling.
- add load information for each frame
- add invasive option which overrides postMessage in the calling window. This should allow the extension to capture lost messages, and look at the timing
- see what we can do about web worker messages
- add support for message channels see the [message channel plan](plans/2026-02-23-message-channel-design.md)
