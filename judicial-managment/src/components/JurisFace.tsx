interface JurisFaceProps {
  compact?: boolean;
}

export default function JurisFace({ compact = false }: JurisFaceProps) {
  const sizeClass = compact ? 'h-16 w-16' : 'h-28 w-28';
  const eyeClass = compact ? 'h-2.5 w-2.5' : 'h-4 w-4';
  const mouthClass = compact ? 'h-1.5 w-8' : 'h-2 w-12';

  return (
    <div className={`relative ${sizeClass} shrink-0`}>
      <div className="absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 rounded-full bg-blue-300" />
      <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1 rounded-full border border-blue-200 bg-white shadow-sm" />
      <div className="absolute inset-x-2 top-3 bottom-1 rounded-[1.5rem] border border-blue-200 bg-white shadow-lg">
        <div className="absolute inset-2 rounded-[1.15rem] bg-blue-700 shadow-inner" />
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-4">
          <span className={`${eyeClass} rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.8)]`} />
          <span className={`${eyeClass} rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.8)]`} />
        </div>
        <div className={`absolute left-1/2 bottom-5 ${mouthClass} -translate-x-1/2 rounded-full bg-blue-200`} />
      </div>
      <div className="absolute -left-1 top-10 h-7 w-2 rounded-full bg-blue-200" />
      <div className="absolute -right-1 top-10 h-7 w-2 rounded-full bg-blue-200" />
    </div>
  );
}
