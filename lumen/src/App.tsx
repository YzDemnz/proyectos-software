import { FormEvent, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Cloud,
  GraduationCap,
  HeartPulse,
  Library,
  Menu,
  Moon,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  Users,
  X,
  Zap,
  CloudUpload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import { SecurityPanel } from '@/components/SecurityPanel';
import { BookCatalog } from '@/components/BookCatalog';
import { BookUpload } from '@/components/BookUpload';

type InfoModalType = 'collections' | 'resources' | null;

type Category = {
  name: string;
  count: string;
  icon: typeof BookOpen;
  color: string;
};

const categories: Category[] = [
  { name: 'Derecho', count: 'Explorar tema', icon: Library, color: 'coral' },
  { name: 'Ciencias Sociales', count: 'Explorar tema', icon: Users, color: 'blue' },
  { name: 'Ciencias Exactas', count: 'Explorar tema', icon: Sparkles, color: 'gold' },
  { name: 'Literatura', count: 'Explorar tema', icon: BookOpen, color: 'rose' },
  { name: 'Salud', count: 'Explorar tema', icon: HeartPulse, color: 'mint' },
  { name: 'Tecnología', count: 'Explorar tema', icon: Zap, color: 'sky' },
  { name: 'Arte y Cultura', count: 'Explorar tema', icon: Palette, color: 'amber' },
];

const benefits = [
  { icon: BookOpen, title: 'Acceso gratuito', text: 'Conocimiento al alcance de todos.' },
  { icon: Cloud, title: 'Desde cualquier lugar', text: 'Descarga y lleva tus lecturas contigo.' },
  { icon: ShieldCheck, title: 'Tu cuenta protegida', text: 'Controles de acceso para tus archivos.' },
  { icon: Users, title: 'Comunidad', text: 'Únete y comparte conocimiento.' },
];

function App() {
  const { user, profile, loading, mfaPending } = useAuth();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [infoModal, setInfoModal] = useState<InfoModalType>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [libraryVersion, setLibraryVersion] = useState(0);

  const openUpload = () => {
    if (!user || mfaPending) setAuthModalOpen(true);
    else setUploadOpen(true);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    document.getElementById('biblioteca')?.scrollIntoView({ behavior: 'smooth' });
  };

  const chooseCategory = (name: string) => {
    setActiveCategory(name);
    setSubmittedQuery('');
    document.getElementById('biblioteca')?.scrollIntoView({ behavior: 'smooth' });
  };

  const closeInfoModal = () => setInfoModal(null);

  const displayName = profile?.username ? `@${profile.username}` : profile?.full_name || 'Usuario';

  return (
    <div className={darkMode ? 'app-shell' : 'app-shell light-mode'}>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Lumen Biblioteca Digital">
          <span className="brand-mark"><BookOpen size={29} strokeWidth={1.45} /></span>
          <span className="brand-copy"><strong>LUMEN</strong><small>BIBLIOTECA DIGITAL</small><em>Conocimiento sin límites</em></span>
        </a>

        <button className="mobile-menu" aria-label="Abrir menú" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <nav className={menuOpen ? 'main-nav nav-open' : 'main-nav'}>
          <a className="active" href="#inicio" onClick={() => setMenuOpen(false)}>Inicio</a>
          <a href="#biblioteca" onClick={() => setMenuOpen(false)}>Explorar</a>
          <a href="#categorias" onClick={() => setMenuOpen(false)}>Categorías</a>
          <button onClick={() => setInfoModal('collections')}>Colecciones</button>
          <button onClick={() => { openUpload(); setMenuOpen(false); }}>Subir libros</button>
          <a href="#acerca" onClick={() => setMenuOpen(false)}>Acerca de</a>
        </nav>

        <div className="header-actions">
          <button className="icon-button" aria-label="Ir a buscar" onClick={() => document.getElementById('buscador')?.focus()}><Search size={18} /></button>
          <button className="icon-button" aria-label="Cambiar tema" onClick={() => setDarkMode(!darkMode)}>{darkMode ? <Sun size={19} /> : <Moon size={19} />}</button>
          {loading ? null : user ? (
            <button className="user-button" onClick={() => setSecurityOpen(true)}>
              <span className="user-avatar"><User size={16} /></span>
              <span className="user-name">{displayName}</span>
            </button>
          ) : (
            <button className="login-button" onClick={() => setAuthModalOpen(true)}>Iniciar sesión</button>
          )}
        </div>
      </header>

      <main>
        <section className="hero" id="inicio">
          <div className="hero-glow glow-one" />
          <div className="hero-glow glow-two" />
          <div className="hero-content">
            <p className="eyebrow"><span /> BIBLIOTECA DIGITAL ABIERTA</p>
            <h1>Lee. Aprende.<br /><span>Descubre.</span></h1>
            <p className="hero-text">Una biblioteca digital para todos. Un espacio para buscar, descubrir y aprender desde cualquier lugar.</p>
            <form className="search-form" onSubmit={handleSearch}>
              <Search size={20} />
              <input id="buscador" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar libros, autores, temas..." aria-label="Buscar libros, autores o temas" />
              <button type="submit" aria-label="Buscar"><ArrowRight size={20} /></button>
            </form>
            <div className="popular-searches"><span>Búsquedas populares:</span>{['Derecho', 'Historia', 'Psicología', 'Novela', 'Ciencia'].map((item) => <button key={item} onClick={() => { setQuery(item); setSubmittedQuery(item); document.getElementById('biblioteca')?.scrollIntoView({ behavior: 'smooth' }); }}>{item}</button>)}</div>
          </div>
          <div className="hero-quote"><span>“</span><p>Los libros<br />son puertas<br />a otros mundos.</p><i /></div>
        </section>

        <section className="category-section" id="categorias">
          <div className="section-heading"><div><p className="eyebrow">EXPLORA POR INTERÉS</p><h2>Encuentra tu próximo descubrimiento</h2></div><button className="text-link" onClick={() => { setActiveCategory(''); document.getElementById('biblioteca')?.scrollIntoView({ behavior: 'smooth' }); }}>Ver todas <ArrowRight size={16} /></button></div>
          <div className="category-grid">
            {categories.map(({ name, count, icon: Icon, color }) => <button className={activeCategory === name ? `category-card selected ${color}` : `category-card ${color}`} key={name} onClick={() => chooseCategory(name)}><Icon size={28} strokeWidth={1.5} /><strong>{name}</strong><span>{count}</span></button>)}
            <button className="category-card all-card" onClick={() => { setActiveCategory(''); document.getElementById('biblioteca')?.scrollIntoView({ behavior: 'smooth' }); }}><span className="grid-icon"><i /><i /><i /><i /></span><strong>Ver todas</strong><span>Explorar temas</span></button>
          </div>
        </section>

        <BookCatalog query={submittedQuery} category={activeCategory} refreshKey={libraryVersion} onUpload={openUpload} onSignIn={() => setAuthModalOpen(true)} onClear={() => { setQuery(''); setSubmittedQuery(''); setActiveCategory(''); }} />

        <section className="feature-panels" id="acerca">
          <button className="feature-panel collections-panel" onClick={() => setInfoModal('collections')}><div><p className="eyebrow">PARA CADA MOMENTO</p><h2>Colecciones<br /><span>especiales</span></h2><p>Explora selecciones temáticas creadas para profundizar en los temas más relevantes.</p><span className="panel-link">Ver colecciones <ArrowRight size={16} /></span></div><div className="panel-lines" /></button>
          <button className="feature-panel resources-panel" onClick={() => setInfoModal('resources')}><GraduationCap size={45} strokeWidth={1.2} /><p className="eyebrow">APRENDE A TU RITMO</p><h2>Recursos académicos</h2><p>Artículos, tesis, guías y más, en un solo lugar.</p><span className="panel-link">Explorar recursos <ArrowRight size={16} /></span></button>
        </section>

        <section className="benefits-section"><div className="benefits-grid">{benefits.map(({ icon: Icon, title, text }) => <div className="benefit" key={title}><Icon size={35} strokeWidth={1.4} /><div><strong>{title}</strong><span>{text}</span></div></div>)}</div></section>
      </main>

      <footer className="site-footer"><div className="footer-top"><a className="brand" href="#inicio"><span className="brand-mark"><BookOpen size={29} strokeWidth={1.45} /></span><span className="brand-copy"><strong>LUMEN</strong><small>BIBLIOTECA DIGITAL</small><em>Conocimiento sin límites</em></span></a><div className="footer-links"><div><strong>Enlaces rápidos</strong><a href="#inicio">Inicio</a><a href="#biblioteca">Explorar</a><a href="#categorias">Categorías</a><button onClick={() => setInfoModal('collections')}>Colecciones</button></div><div><strong>Legal</strong><button onClick={() => setInfoModal('resources')}>Términos de uso</button><button onClick={() => setInfoModal('resources')}>Política de privacidad</button><button onClick={() => setInfoModal('resources')}>Aviso de derechos de autor</button></div><div><strong>Síguenos</strong><div className="socials"><button aria-label="Discord">◌</button><button aria-label="X">𝕏</button><button aria-label="Instagram">◎</button><button aria-label="YouTube">▶</button><button aria-label="Correo">✉</button></div></div></div><blockquote>“El conocimiento<br />es libertad.”</blockquote></div><div className="footer-bottom"><span>© 2026 LUMEN Biblioteca Digital. Todos los derechos reservados.</span><span>Por Mares Studio.</span></div></footer>

      {infoModal && <div className="modal-backdrop" role="presentation" onClick={closeInfoModal}><div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={closeInfoModal} aria-label="Cerrar"><X size={19} /></button><div className="modal-symbol">{infoModal === 'collections' ? <Sparkles size={28} /> : <GraduationCap size={28} />}</div><p className="eyebrow">LUMEN</p><h2>{infoModal === 'collections' ? 'Colecciones especiales' : 'Recursos académicos'}</h2><p className="modal-description">{infoModal === 'collections' ? 'Estamos curando colecciones temáticas para acompañar cada etapa de tu aprendizaje.' : 'Muy pronto podrás explorar artículos, tesis, guías y recursos seleccionados.'}</p><div className="coming-soon">Contenido disponible próximamente</div><button className="secondary-button" onClick={closeInfoModal}>Entendido</button></div></div>}

      <button className="upload-fab" onClick={openUpload} aria-label="Subir libros">
        <CloudUpload size={22} />
        <span>Subir Libros</span>
      </button>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <SecurityPanel open={securityOpen} onClose={() => setSecurityOpen(false)} />
      <BookUpload open={uploadOpen && !!user && !mfaPending} onClose={() => setUploadOpen(false)} onUploaded={() => { setLibraryVersion((value) => value + 1); setQuery(''); setSubmittedQuery(''); setActiveCategory(''); document.getElementById('biblioteca')?.scrollIntoView({ behavior: 'smooth' }); }} />
    </div>
  );
}

export default App;
