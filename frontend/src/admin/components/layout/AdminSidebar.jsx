import { NavLink, useNavigate } from 'react-router-dom';
import useAuth from '../../../context/useAuth';
import navigation from '../../config/navigation';

const icons = {
  dashboard: '📊',
  transactions: '📄',
  inventory: '📦',
  mechanics: '🔧',
  logout: '🧾'
};

function Icon({ name }) {
  return <span className="nav-icon" aria-hidden="true">{icons[name]}</span>;
}

function AdminSidebar({ badges, loading, isDrawerLayout, drawerOpen, drawerRef, onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const signOut = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };
  return (
    <>
      {isDrawerLayout && drawerOpen && <button type="button" className="sidebar-backdrop" aria-label="Close navigation menu" onClick={() => onClose('overlay')} />}
      <aside
        ref={drawerRef}
        className={`sidebar${isDrawerLayout ? drawerOpen ? ' drawer-open' : ' drawer-closed' : ''}`}
        aria-label="Admin sidebar"
        role={isDrawerLayout && drawerOpen ? 'dialog' : undefined}
        aria-modal={isDrawerLayout && drawerOpen ? 'true' : undefined}
        aria-hidden={isDrawerLayout && !drawerOpen}
        inert={isDrawerLayout && !drawerOpen}
      >
        <div className="sidebar-header">
          <div className="brand-row">
            <div className="brand" aria-label="RevInsight AI Admin">
              <img className="brand-logo" src="/logo-admin.png" alt="RevInsight AI admin" width="44" height="44" />
              <div className="brand-text">
                <span className="brand-name-row">
                  <span className="brand-name">REVINSIGHT</span>
                  <span className="brand-ai-badge">AI</span>
                </span>
                <span className="brand-role">Admin</span>
              </div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav" id="admin-sidebar-navigation" aria-label="Admin navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.id === 'dashboard'}
              onClick={() => onClose('navigation')}
              aria-label={item.label}
              title={undefined}
              className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
            >
              <Icon name={item.icon} />
              <span className="nav-label">{item.label}</span>
              {!loading && Number(badges?.[item.badgeKey]) > 0 && <span className="nav-badge">{badges[item.badgeKey]}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="nav-item logout" onClick={signOut} aria-label="Logout">
            <Icon name="logout" />
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default AdminSidebar;
