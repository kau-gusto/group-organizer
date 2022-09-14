chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading")
    if (changeInfo.groupId === undefined || changeInfo.groupId > 0)
      return;

  const removedTabs = await removeRepeatedTabs(tab)
  if (removedTabs)
    return;

  if (tab.pinned === false) {
    const title = getTitle(tab.pendingUrl ?? tab.url);
    await groupByTitle(tab, title);
  }

  const activeTabs = await chrome.tabs.query({
    active: true
  })

  await collapseGroupsExcept([tab, ...activeTabs]
    .filter(tab => tab.groupId > -1)
    .map(tab => tab.groupId))
});

/**
 * @param {chrome.tabs.Tab} tab
 * @param {string} title
 */
async function groupByTitle(tab, title) {
  const groups = await chrome.tabGroups.query({
    title,
    windowId: tab.windowId,
  });
  const group = await mergeGroups(groups);

  try {
    const groupId = await chrome.tabs.group({
      tabIds: [tab.id],
      groupId: group ? group.id : null,
    });
    await chrome.tabGroups.update(groupId, {
      title,
      collapsed: false,
    });
    return groupId;
  } catch (error) { }
}

/**
 * @param {chrome.tab.Tabs} tab 
 * @returns {Promise<boolean>}
 */
async function removeRepeatedTabs(tab) {
  const tabs = await chrome.tabs.query({
    url: tab.url,
  });

  if (tabs.length <= 1)
    return false

  const [tabComplete] = tabs.filter((lastTab) => lastTab.id !== tab.id);

  await chrome.tabs.remove([tab.id]);
  await chrome.tabs.update(tabComplete.id, {
    active: tab.active,
  });

  return true;
}


/**
 * @param {string | null} url
 */
function getTitle(url) {
  if (url == null) return "!";

  const urlMatch = url.match(
    /http(?:s)?:\/\/(?:[\w]+\.)?([\w-]{1,63})(?:\.\w{2,3})+(?:$|\/)/
  );

  if (urlMatch) return urlMatch[1];

  const localhostMatch = url.match(
    /^http(?:s)?:\/\/(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\:(\d{4}))?(?:$|\/)/
  );

  if (localhostMatch) {
    const portMatch = localhostMatch[2];
    if (portMatch) return portMatch;
    if (localhostMatch[1] == "127.0.0.1") return "localhost";
    return localhostMatch[1];
  }

  const chromeMatch = url.match(/^chrome:\/\/([\w-]{1,63})(?:$|\/)/);

  if (chromeMatch) return `(${chromeMatch[1]})`;

  return "?";
}

/**
 * @param {chrome.tabGroups.TabGroup[]} groups
 * @returns {Promise<chrome.tabGroups.TabGroup | null>}
 */
async function mergeGroups(groups) {
  const baseGroup = groups[0];

  groups
    .filter((_, index) => index !== 0)
    .map(async (group) => {
      const groupTabs = await chrome.tabs.query({
        groupId: group.id,
      });

      chrome.tabs.group({
        tabIds: groupTabs.map((tab) => tab.id),
        groupId: baseGroup.id,
      });
    });
  return baseGroup;
}

/**
 * @param {Array<number>} idsGroupsExcluded 
 */
async function collapseGroupsExcept(idsGroupsExcluded) {
  const allGroups = await chrome.tabGroups.query({
    collapsed: false,
  });

  allGroups
    .filter(group => idsGroupsExcluded.indexOf(group.id) == -1)
    .forEach(async (group) => {
      await chrome.tabGroups.update(group.id, {
        collapsed: true,
      });
    });
}
