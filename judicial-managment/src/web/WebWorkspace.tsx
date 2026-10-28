import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Bell, CalendarPlus, ChevronDown, ChevronRight, HelpCircle as CircleHelp, FileCheck, LogOut, Menu, Moon, Plus, RefreshCw, Settings, Sun, Wifi, WifiOff, X, type LucideIcon } from 'lucide-react';
import GlobalSearch from '../components/GlobalSearch';
import BrandMark from './BrandMark';

type Section = 'dashboard' | 'juris' | 'totalExpedientes' | 'expedientes' | 'archivo' | 'escriba' | 'movimientos' | 'calendario' | 'chatDespacho' | 'clientes' | 'reportes' | 'tribunal' | 'configuracion';
interface Props {
  activeSection: Section;
  sectionName: string;
  despachoId: string;
  despachoName: string;
  userName: string;
  roleLabel: string;
  premiumAccess: boolean;
  canEdit: boolean;
  navigation: { id: Section; name: string; icon: LucideIcon }[];
  onNavigate: (section: Section) => void;
  searchRef: RefObject<HTMLInputElement>;
  onRefresh: () => void;
  isRefreshing: boolean;
  realtime: 'idle' | 'connecting' | 'connected' | 'offline';
  realtimeLabel: string;
  onReconnect: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  children: ReactNode;
  notice: ReactNode;
  overlays: ReactNode;
}

export default function WebWorkspace(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const initials = props.userName.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('es-MX');
  const firstName = props.userName.split(/\s+/)[0];
  const dateLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  function navigate(section: Section) { props.onNavigate(section); setMenuOpen(false); setAccountOpen(false); setCreateOpen(false); }
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
      if (!createRef.current?.contains(event.target as Node)) setCreateOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setAccountOpen(false); setCreateOpen(false); setMenuOpen(false); }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, []);
  return <div className="jm-workspace">
    {props.overlays}
    <a className="jm-skip" href="#jm-main">Ir al contenido</a>
    {menuOpen && <button className="jm-nav-scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar navegación" />}
    <aside className={`jm-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Navegación principal">
      <button className="jm-brand" onClick={() => navigate('dashboard')} aria-label="Judicial Managment, inicio"><BrandMark /><span>Judicial<br />Managment</span></button>
      <div className="jm-despacho" title={props.despachoName}><span>{props.despachoName}</span></div>
      <nav className="jm-navigation">{props.navigation.filter(item => item.id !== 'configuracion').map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={props.activeSection === item.id ? 'is-active' : ''} onClick={() => navigate(item.id)} aria-current={props.activeSection === item.id ? 'page' : undefined}><Icon strokeWidth={1.7} /><span>{item.id === 'dashboard' ? 'Inicio' : item.name}</span></button>;
      })}</nav>
      <div className="jm-sidebar-bottom">
        <button className={props.activeSection === 'juris' ? 'is-active' : ''} onClick={() => navigate('juris')}><CircleHelp /><span>{props.premiumAccess ? 'Ayuda · Juris IA' : 'Ayuda'}</span></button>
        <button className={props.activeSection === 'configuracion' ? 'is-active' : ''} onClick={() => navigate('configuracion')}><Settings /><span>Configuración</span></button>
        <button className="jm-profile" onClick={() => navigate('configuracion')}><span className="jm-avatar">{initials}</span><span>{props.userName}</span><ChevronRight /></button>
      </div>
    </aside>
    <div className="jm-body">
      <header className="jm-topbar">
        <button className="jm-icon-button jm-mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Cerrar navegación' : 'Abrir navegación'}>{menuOpen ? <X /> : <Menu />}</button>
        <strong className="jm-page-name">{props.activeSection === 'dashboard' ? 'Inicio' : props.sectionName}</strong>
        <GlobalSearch despachoId={props.despachoId} inputRef={props.searchRef} includeEscriba={props.premiumAccess} variant="windows" onNavigate={navigate} />
        <div className="jm-topbar-actions">
          <button className="jm-icon-button" onClick={() => navigate('calendario')} title="Agenda y recordatorios" aria-label="Agenda y recordatorios"><Bell /></button>
          <div className="jm-account" ref={accountRef}>
            <button className="jm-account-toggle" onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen} aria-label="Opciones de mi cuenta"><span className="jm-avatar">{initials}</span><ChevronDown /></button>
            {accountOpen && <div className="jm-dropdown"><div className="jm-dropdown-person"><strong>{props.userName}</strong><small>{props.roleLabel}</small></div>
              <button onClick={() => navigate('configuracion')}><Settings />Mi cuenta y despacho</button>
              <button onClick={props.onToggleTheme}>{props.isDarkMode ? <Sun /> : <Moon />}{props.isDarkMode ? 'Modo claro' : 'Modo oscuro'}</button>
              <button onClick={props.onRefresh} disabled={props.isRefreshing}><RefreshCw className={props.isRefreshing ? 'animate-spin' : ''} />Actualizar información</button>
              <button onClick={props.onReconnect}>{props.realtime === 'offline' ? <WifiOff /> : <Wifi />}<span>{props.realtimeLabel}</span></button>
              <button onClick={props.onLogout} className="jm-signout"><LogOut />Cerrar sesión</button>
            </div>}
          </div>
        </div>
      </header>
      <main id="jm-main" className="jm-main" tabIndex={-1}>
        {props.notice}
        {props.activeSection !== 'escriba' && <div className="jm-page-heading"><div>
          {props.activeSection === 'dashboard' ? <><p className="jm-date">{dateLabel}</p><h1>Buen día{firstName ? `, ${firstName}` : ''}.</h1><p>Tu despacho, a tu ritmo.</p></> : <h1>{props.sectionName}</h1>}
        </div>{props.canEdit && <div className="jm-create" ref={createRef}><button className="jm-primary" onClick={() => setCreateOpen(!createOpen)} aria-expanded={createOpen}><Plus />Crear nuevo<ChevronDown /></button>
          {createOpen && <div className="jm-dropdown"><button onClick={() => navigate('expedientes')}><Plus />Nuevo expediente</button><button onClick={() => navigate('movimientos')}><FileCheck />Registrar movimiento</button><button onClick={() => navigate('calendario')}><CalendarPlus />Agendar evento</button></div>}
        </div>}</div>}
        <div className="jm-content">{props.children}</div>
      </main>
    </div>
  </div>;
}
