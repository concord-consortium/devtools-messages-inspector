# Remaining for Version 1
- the endpoints pane should be organized by tab/iframe/document, in the future we can add workers but they require a more invasive extension. The focused frame should be focused endpoint. And the list should be organized by document. I think we can simplify the view so that we don't need to have un clickable entries for tabs and frames.
- the opener shows up in the endpoints as part of the hierarchy, not in the special "other known frames". It seems it should be in the other known frames section.
- the endpoints should indicate when a frame is no longer part of the current hierarchy. How we update that information is not obvious. We could poll the frame info for the tabs the current panel knows about. I think we can also monitor "change events" when new frames are created (and perhaps removed too). We could at least get this information when the frame details is opened.
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
- the pane on right of messages that comes out doesn't behave correctly on resize
- the reload icon on the endpoints page is broken
- the endpoints page should automatically update when it can. With the test harness actions this should be easier to implement and test now
- The Hierarchy Map should support a mode where the frame is collapsed into its parent node. So this way the Tab represents itself plus its Frame. And the IFrame represents itself plus its Frame. This will reduce the number of containers shown and make it easier for someone to reason about without getting bogged down in the Frame construct the browser is using underneath. It still keeps the Document concept since there can multiple of those.

- truncate long values in the context pane with some way to see the full value.
- clean up the left side
- show opened windows in the hierarchy
- unknown openers (no openedTabs mapping) don't get a Frame in FrameStore because Frame requires numeric tabId/frameId. To support them, Frame would need to work without tab/frame IDs.

- update documentation on matching up iframes with frameIds, the issue linked in the doc is nuanced. It sounds like it will not be fixed for a while, but perhaps a new issue that provides the documentId would be something better.
- improve UI to better match the rest of the dev tools styling
- show a banner when the extension is reloaded/updated while the panel is open, telling the user to reopen DevTools
- update frame id syntax so it is more liqe friendly, perhaps just tX.fY
- in an opened tab, the registration messages sent to the opener, should identify that tab/frame as the opener. We don't really have a target type, but this might be a reason for one. When we look at the endpoints this endpoint seems to be identified as an opener and is labeled with a "source type" of "opener". I'm not sure what the point is here, but it seems there is something missing, perhaps just adding a target type.
- create a website for the extension, could just be github.io
- deploy test harness page, and manual testing page to this website

# Test Harness Separation
- separate out the test harness into its own repository.
- automatic verification of the test harness: create a new extension that can be run inside of playwright. Then have a test set of webpages, that playwright can drive to generate the same events and behavior as the test-harness. This verification can be run in GitHub actions to make sure new versions of Chrome behave the same way as what we are expecting. The hierarchy actions are designed so that we know what we need to verify.

# Version 1.1
- import button

# Version 2
- add timing view: a sequence diagram with one row per frame, x axis can be based on time, we'll need scaling.
- add load information for each frame
- add invasive option which overrides postMessage in the calling window. This should allow the extension to capture lost messages, and look at the timing
- see what we can do about web worker messages
- add support for message channels see the [message channel plan](plans/2026-02-23-message-channel-design.md)
- add support for [web worker messages](web-worker-messages.md)
