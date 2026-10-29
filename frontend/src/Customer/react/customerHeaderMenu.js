export function customerHeaderMenuReducer(state, action) {
  switch (action.type) {
    case 'toggle-account':
      return { accountOpen: !state.accountOpen, notificationsOpen: false };
    case 'toggle-notifications':
      return { accountOpen: false, notificationsOpen: !state.notificationsOpen };
    case 'close':
      return { accountOpen: false, notificationsOpen: false };
    default:
      return state;
  }
}

export function isOutsideCustomerMenus(target, accountArea, notificationArea) {
  return !accountArea?.contains(target) && !notificationArea?.contains(target);
}
