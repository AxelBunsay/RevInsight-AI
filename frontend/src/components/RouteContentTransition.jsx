import { createElement } from 'react';
import { useLocation } from 'react-router-dom';
import './route-content-transition.css';
import { getRouteContentKey } from './routeContentTransitionKey';

export default function RouteContentTransition({ pathname: pathnameOverride, children }) {
  const { pathname: currentPathname } = useLocation();
  const pathname = pathnameOverride || currentPathname;

  return createElement(
    'div',
    {
      key: getRouteContentKey(pathname),
      className: 'route-content-transition',
      'data-route-path': pathname
    },
    children
  );
}
