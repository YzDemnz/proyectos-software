import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bird,
  Check,
  CheckCircle2,
  CloudUpload,
  FileText,
  Image,
  Info,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';

type UploadTutorialProps = {
  open: boolean;
  onClose: () => void;
};

type TutorialStep = {
  eyebrow: string;
  title: string;
  description: string;
};

const steps: TutorialStep[] = [
  {
    eyebrow: 'PASO 1 · ARCHIVO DEL LIBRO',
    title: 'Comienza con tu archivo',
    description: 'Arrastra el archivo del libro o selecciónalo desde tu dispositivo. Aceptamos PDF, EPUB y MOBI de hasta 100 MB.',
  },
  {
    eyebrow: 'PASO 2 · INFORMACIÓN DEL LIBRO',
    title: 'Completa los datos',
    description: 'Escribe la información que ayudará a las personas a encontrar y entender tu libro: título, autor, categoría, idioma, año, descripción y etiquetas.',
  },
  {
    eyebrow: 'PASO 3 · PORTADA',
    title: 'Elige una portada fiel',
    description: 'Sube una imagen vertical y nítida. La portada puede haber sido creada con IA, siempre que represente fielmente la portada real del libro.',
  },
  {
    eyebrow: 'PASO 4 · DERECHOS Y PUBLICACIÓN',
    title: 'Revisa antes de publicar',
    description: 'Confirma que tienes permiso para compartir el material y revisa la vista previa antes de enviar el libro a revisión.',
  },
];

function Mascot({ mood = 'calm' }: { mood?: 'calm' | 'alert' | 'happy' }) {
  return (
    <div className={`tutorial-mascot mascot-${mood}`} aria-hidden="true">
      <div className="mascot-aura"><Sparkles size={15} /></div>
      <div className="mascot-bird"><Bird size={76} strokeWidth={1.25} /></div>
      <div className="mascot-book"><FileText size={18} /></div>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="tutorial-progress" aria-label={`Paso ${step + 1} de ${steps.length}`}>
      {steps.map((item, index) => <span className={index <= step ? 'progress-dot active' : 'progress-dot'} key={item.eyebrow} />)}
    </div>
  );
}

function UploadTutorial({ open, onClose }: UploadTutorialProps) {
  const [step, setStep] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  if (!open) return null;

  const close = () => {
    setStep(0);
    setShowWarning(false);
    onClose();
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    setShowWarning(true);
  };

  const previous = () => {
    if (showWarning) {
      setShowWarning(false);
      return;
    }
    setStep(Math.max(0, step - 1));
  };

  return (
    <div className={showWarning ? 'upload-tutorial-backdrop warning-mode' : 'upload-tutorial-backdrop'} role="presentation">
      <div className="upload-tutorial-shell" role="dialog" aria-modal="true" aria-label="Tutorial para subir libros">
        <header className="tutorial-header">
          <div className="tutorial-brand"><span className="tutorial-brand-mark"><FileText size={20} /></span><span><strong>LUMEN</strong><small>GUÍA PARA SUBIR LIBROS</small></span></div>
          <div className="tutorial-header-center"><Progress step={step} /><span>{showWarning ? 'Aviso importante' : `Paso ${step + 1} de ${steps.length}`}</span></div>
          <button className="tutorial-close" onClick={close} aria-label="Cerrar tutorial"><X size={21} /></button>
        </header>

        {showWarning ? (
          <section className="tutorial-warning-screen">
            <div className="warning-shake"><AlertTriangle size={62} strokeWidth={1.35} /></div>
            <Mascot mood="alert" />
            <div className="warning-copy">
              <p className="tutorial-eyebrow danger-eyebrow">IMPORTANTE · REVISION OBLIGATORIA</p>
              <h2>Publicar también es una responsabilidad.</h2>
              <p>Todo el material pasará por revisión. Si el contenido no pertenece al libro, la portada es incorrecta, la fecha no coincide o faltan datos, enviaremos una advertencia para solicitar la corrección.</p>
              <p className="warning-strong">Si subes contenido falso, explícito, inventado o que no existe, tu cuenta será baneada permanentemente de la opción para subir libros.</p>
            </div>
            <div className="tutorial-actions warning-actions"><button className="tutorial-secondary" onClick={previous}><ArrowLeft size={17} /> Volver</button><button className="tutorial-primary danger-primary" onClick={() => setShowWarning(false)}>Entiendo <Check size={17} /></button></div>
          </section>
        ) : (
          <section className="tutorial-stage" key={step}>
            <div className="tutorial-art-column">
              <Mascot mood={step === 3 ? 'happy' : 'calm'} />
              <div className="tutorial-speech"><span className="speech-tail" /><p>{step === 0 ? 'Yo te acompaño. Subir conocimiento es más fácil de lo que parece.' : step === 1 ? 'Estos datos hacen que tu libro pueda ser encontrado y catalogado correctamente.' : step === 2 ? 'La portada debe ser fiel, clara y reconocible. ¡La calidad ayuda a todos!' : 'Una última revisión protege tu trabajo y a toda la comunidad.'}</p></div>
            </div>
            <div className="tutorial-content">
              <p className="tutorial-eyebrow">{steps[step].eyebrow}</p>
              <h1>{steps[step].title}</h1>
              <p className="tutorial-description">{steps[step].description}</p>
              <StagePreview step={step} />
              <div className="tutorial-actions"><button className="tutorial-secondary" onClick={step === 0 ? close : previous}>{step === 0 ? 'Salir' : <><ArrowLeft size={17} /> Atrás</>}</button><button className="tutorial-primary" onClick={next}>{step === steps.length - 1 ? 'Continuar' : 'Siguiente'} <ArrowRight size={17} /></button></div>
            </div>
          </section>
        )}

        {!showWarning && <footer className="tutorial-footer"><Info size={14} /> Este es un recorrido informativo. Al terminar podrás cerrar la guía y comenzar tu publicación.</footer>}
        {showWarning && <footer className="tutorial-footer warning-footer"><ShieldCheck size={14} /> Revisamos cada publicación para cuidar la calidad de Lumen.</footer>}
      </div>
    </div>
  );
}

function StagePreview({ step }: { step: number }) {
  if (step === 0) {
    return <div className="preview-upload"><CloudUpload size={40} /><strong>Arrastra tu archivo aquí</strong><span>o haz clic para seleccionarlo</span><small>PDF · EPUB · MOBI · Máximo 100 MB</small></div>;
  }

  if (step === 1) {
    return <div className="preview-form"><div className="preview-form-row"><span><b>Título del libro</b><i>Nombre completo de la obra</i></span><span><b>Autor</b><i>Nombre del autor o autora</i></span></div><div className="preview-form-row"><span><b>Categoría o género</b><i>Selecciona una categoría</i></span><span><b>Idioma</b><i>Selecciona el idioma</i></span></div><span className="preview-textarea"><b>Descripción</b><i>Cuenta brevemente de qué trata el libro...</i></span><div className="preview-tag-row"><Tag size={15} /><span>Etiquetas para facilitar la búsqueda</span></div></div>;
  }

  if (step === 2) {
    return <div className="preview-cover"><div className="cover-placeholder"><Image size={32} /><span>Portada del libro</span><small>JPG o PNG · 1200 × 1800 px recomendado</small></div><div className="cover-rules"><CheckCircle2 size={17} /><span>Puede ser creada con IA</span><CheckCircle2 size={17} /><span>Debe ser fiel a la portada real</span><CheckCircle2 size={17} /><span>Debe ser clara y vertical</span></div></div>;
  }

  return <div className="preview-publish"><div className="publish-check"><LockKeyhole size={20} /><span>Confirmo que tengo los derechos o autorización para publicar este material.</span></div><div className="publish-actions"><span><FileText size={16} /> Guardar borrador</span><span><Check size={16} /> Vista previa</span><strong>Publicar libro <ArrowRight size={15} /></strong></div></div>;
}

export default UploadTutorial;
