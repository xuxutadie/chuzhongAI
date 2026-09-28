export function createNavigationWheelItems(groups) {
  return groups.flatMap((group) => [
    { type: "marker", id: `marker-${group.label}`, label: group.label },
    ...group.items.map((item) => ({ ...item, type: "link", id: item.href }))
  ]);
}

export function getInitialNavigationFocusIndex(items, pathname) {
  const currentIndex = items.findIndex((item) => item.type === "link" && item.href === pathname);
  if (currentIndex >= 0) {
    return currentIndex;
  }

  return items.findIndex((item) => item.type === "link");
}

export function moveNavigationFocusIndex(items, focusIndex, delta) {
  const linkIndexes = items.reduce((indexes, item, index) => {
    if (item.type === "link") {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const currentPosition = Math.max(linkIndexes.indexOf(focusIndex), 0);
  const nextPosition = Math.min(Math.max(currentPosition + delta, 0), Math.max(linkIndexes.length - 1, 0));

  return linkIndexes[nextPosition] ?? -1;
}
