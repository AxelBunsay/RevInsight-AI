import { useCallback, useEffect, useState } from 'react';
import { CustomerPrototypeContext } from './CustomerPrototypeContext';

const STORAGE_KEY = 'revinsightCustomerPrototype';
function readInitialState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      cart: Array.isArray(saved.cart) ? saved.cart : [],
      wishlist: Array.isArray(saved.wishlist) ? saved.wishlist : [],
      reservations: Array.isArray(saved.reservations) ? saved.reservations : [],
      vehicles: Array.isArray(saved.vehicles) ? saved.vehicles : [],
      profile: saved.profile || JSON.parse(localStorage.getItem('customerUser') || '{}')
    };
  } catch {
    return { cart: [], wishlist: [], reservations: [], vehicles: [], profile: {} };
  }
}

export function CustomerPrototypeProvider({ children }) {
  const [state, setState] = useState(readInitialState);

  useEffect(() => {
    const isEmpty = !state.cart.length && !state.wishlist.length && !state.reservations.length
      && !state.vehicles.length && !Object.keys(state.profile).length;
    if (isEmpty) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addCartItem = (item) => {
    const key = item.kind === 'service'
      ? `${item.id}:${item.bookingDate}:${item.startTime}`
      : item.id;
    setState((current) => {
      const existing = current.cart.find((entry) => entry.key === key);
      const cart = existing
        ? current.cart.map((entry) => entry.key === key ? { ...entry, quantity: Math.min(entry.quantity + (item.quantity || 1), entry.stock ?? Infinity) } : entry)
        : [...current.cart, { ...item, key, quantity: item.kind === 'service' ? 1 : item.quantity || 1 }];
      return { ...current, cart };
    });
  };

  const updateCartItem = (key, quantity) => setState((current) => ({
    ...current,
    cart: current.cart.map((item) => item.key === key
      ? { ...item, quantity: item.kind === 'service' ? 1 : item.stock === 0 ? 0 : Math.max(1, Math.min(Number(quantity) || 1, item.stock ?? Infinity)) }
      : item)
  }));

  const setCartItemStock = useCallback((key, stock, price, name) => setState((current) => ({
    ...current,
    cart: current.cart.map((item) => item.key === key
      ? { ...item, stock, ...(Number.isFinite(price) ? { price } : {}), ...(name ? { name } : {}), quantity: Math.min(item.quantity, stock) }
      : item)
  })), []);

  const removeCartItem = (key) => setState((current) => ({ ...current, cart: current.cart.filter((item) => item.key !== key) }));
  const replaceCartItem = (key, item) => {
    const nextKey = item.kind === 'service'
      ? `${item.id}:${item.bookingDate}:${item.startTime}`
      : item.id;
    setState((current) => ({
      ...current,
      cart: current.cart
        .filter((entry) => entry.key !== key && entry.key !== nextKey)
        .concat({ ...item, key: nextKey, quantity: item.kind === 'service' ? 1 : item.quantity || 1 })
    }));
  };
  const toggleWishlist = (productId) => setState((current) => ({
    ...current,
    wishlist: current.wishlist.includes(productId)
      ? current.wishlist.filter((id) => id !== productId)
      : [...current.wishlist, productId]
  }));

  const updateProfile = (profile) => setState((current) => ({ ...current, profile: { ...current.profile, ...profile } }));
  const addVehicle = (vehicle) => setState((current) => ({ ...current, vehicles: [...current.vehicles, { ...vehicle, id: `VEH-${Date.now()}` }] }));
  const clearCustomerData = () => {
    setState({ cart: [], wishlist: [], reservations: [], vehicles: [], profile: {} });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('customerCart');
    localStorage.removeItem('customerVehicles');
    localStorage.removeItem('customerProfile');
    localStorage.removeItem('customerUser');
  };

  return (
    <CustomerPrototypeContext.Provider value={{ ...state, addCartItem, updateCartItem, setCartItemStock, removeCartItem, replaceCartItem, toggleWishlist, updateProfile, addVehicle, clearCustomerData }}>
      {children}
    </CustomerPrototypeContext.Provider>
  );
}