const navigation = [
  { id: 'dashboard', label: 'Dashboard', path: '/admin', icon: 'dashboard', roles: ['admin'] },
  { id: 'transactions', label: 'Transactions', path: '/admin/transactions', icon: 'transactions', roles: ['admin'] },
  { id: 'queue', label: 'Service queue', path: '/admin/service-requests', icon: 'mechanics', roles: ['admin'] },
  { id: 'inventory', label: 'Inventory', path: '/admin/inventory', icon: 'inventory', roles: ['admin'], badgeKey: 'lowStock' },
  { id: 'mechanics', label: 'Mechanics', path: '/admin/mechanics', icon: 'mechanics', roles: ['admin'] }
];

export default navigation;
