import { useMemo, useState, type ComponentType } from 'react';
import {
  Image as RNImage,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowRight,
  Check,
  Circle,
  Image as ImageIcon,
  Package,
  ReceiptText,
  Store,
  Users,
  WalletCards,
  type LucideProps,
} from 'lucide-react-native';

import { appFonts } from '../theme/typography';
import type { Product } from '../types';
import { pickImageDataUri } from '../utils/imagePicker';

type IconComponent = ComponentType<LucideProps>;

type OnboardingFlowScreenProps = {
  initialName: string;
  onContinue: (result: {
    giro: string;
    logoUri: string;
    name: string;
    starterProducts: Product[];
  }) => void;
};

type Giro = {
  label: string;
  focus: string;
};

const giros: Giro[] = [
  { label: 'Tienda', focus: 'Inventario y venta rapida' },
  { label: 'Barberia', focus: 'Agenda, clientes y servicios' },
  { label: 'Taller', focus: 'Trabajos, anticipos y piezas' },
  { label: 'Ropa', focus: 'Tallas, colores y stock' },
  { label: 'Comida', focus: 'Menu, pedidos y combos' },
  { label: 'Papeleria', focus: 'Productos, stock y codigos' },
  { label: 'Servicios', focus: 'Clientes, citas y pagos' },
  { label: 'Otro', focus: 'Configuracion general' },
];

const steps = [
  'Bienvenida',
  'Giro',
  'Negocio',
  'Productos',
  'Venta',
  'Resumen',
];

export function OnboardingFlowScreen({
  initialName,
  onContinue,
}: OnboardingFlowScreenProps) {
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState(initialName);
  const [logoUri, setLogoUri] = useState('');
  const [selectedGiro, setSelectedGiro] = useState(giros[0]);
  const [starterProducts, setStarterProducts] = useState<Product[]>([]);
  const cleanName = useMemo(
    () => businessName.trim() || 'Mi negocio',
    [businessName],
  );

  const isLast = step === steps.length - 1;

  const next = () => {
    if (isLast) {
      onContinue({
        giro: selectedGiro.label,
        logoUri,
        name: cleanName,
        starterProducts,
      });
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              Paso {step + 1} de {steps.length}
            </Text>
            <Text style={styles.progressStep}>{steps[step]}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${((step + 1) / steps.length) * 100}%` },
              ]}
            />
          </View>

          {step === 0 && <WelcomeStep />}
          {step === 1 && (
            <BusinessTypeStep
              onSelect={setSelectedGiro}
              selected={selectedGiro}
            />
          )}
          {step === 2 && (
            <BusinessNameStep
              businessName={businessName}
              giro={selectedGiro}
              logoUri={logoUri}
              onChangeName={setBusinessName}
              onChangePhoto={setLogoUri}
            />
          )}
          {step === 3 && (
            <ProductsStep
              onAddProduct={(product) =>
                setStarterProducts((current) => [...current, product])
              }
              products={starterProducts}
            />
          )}
          {step === 4 && <FirstSaleStep />}
          {step === 5 && (
            <SummaryStep
              businessName={cleanName}
              giro={selectedGiro}
              productCount={starterProducts.length}
            />
          )}

          <View style={styles.footerActions}>
            {step > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setStep((current) => Math.max(current - 1, 0))}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Atras</Text>
              </Pressable>
            ) : (
              <View style={styles.secondarySpacer} />
            )}
            <Pressable
              accessibilityRole="button"
              onPress={next}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isLast ? 'Ver mi resumen' : step === 0 ? 'Empezar gratis' : 'Continuar'}
              </Text>
              <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WelcomeStep() {
  return (
    <View style={styles.contentBlock}>
      <View style={styles.heroMark}>
        <Store size={34} color="#FFFFFF" strokeWidth={2.5} />
      </View>
      <Text style={styles.title}>
        Controla ventas, inventario y fiados desde tu celular.
      </Text>
      <Text style={styles.copy}>
        Configura lo basico mientras usas la app. Sin tutorial largo, sin panel
        vacio.
      </Text>
      <View style={styles.benefitStack}>
        <Benefit icon={ReceiptText} text="Registra ventas en segundos." />
        <Benefit icon={Package} text="Evita quedarte sin productos." />
        <Benefit icon={WalletCards} text="Recuerda quien te debe." />
      </View>
    </View>
  );
}

function BusinessTypeStep({
  onSelect,
  selected,
}: {
  onSelect: (giro: Giro) => void;
  selected: Giro;
}) {
  return (
    <View style={styles.contentBlock}>
      <Text style={styles.kicker}>Tipo de negocio</Text>
      <Text style={styles.title}>La app se adapta a tu giro</Text>
      <Text style={styles.copy}>
        El plan gratis arranca con control tipo Pro: inventario ilimitado,
        ventas, clientes, deudas y reportes basicos.
      </Text>
      <View style={styles.giroGrid}>
        {giros.map((giro) => {
          const active = giro.label === selected.label;
          return (
            <Pressable
              accessibilityRole="button"
              key={giro.label}
              onPress={() => onSelect(giro)}
              style={({ pressed }) => [
                styles.giroCard,
                active && styles.giroCardActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.giroLabel,
                  active && styles.giroLabelActive,
                ]}
              >
                {giro.label}
              </Text>
              <Text
                style={[styles.giroFocus, active && styles.giroFocusActive]}
              >
                {giro.focus}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BusinessNameStep({
  businessName,
  giro,
  logoUri,
  onChangeName,
  onChangePhoto,
}: {
  businessName: string;
  giro: Giro;
  logoUri: string;
  onChangeName: (value: string) => void;
  onChangePhoto: (value: string) => void;
}) {
  const [photoMessage, setPhotoMessage] = useState('');

  const choosePhoto = async () => {
    try {
      onChangePhoto(await pickImageDataUri());
      setPhotoMessage('Foto agregada al perfil del negocio.');
    } catch (error) {
      setPhotoMessage((error as Error).message);
    }
  };

  return (
    <View style={styles.contentBlock}>
      <Text style={styles.kicker}>Tu sistema</Text>
      <Text style={styles.title}>Que se vea como tu negocio</Text>
      <Text style={styles.copy}>
        Nombre, giro y logo hacen que el usuario sienta que la app ya es su
        sistema.
      </Text>

      <View style={styles.businessPreview}>
        <View style={styles.logoPreview}>
          {logoUri ? (
            <RNImage source={{ uri: logoUri }} style={styles.logoPreviewImage} />
          ) : (
            <ImageIcon size={28} color="#FFFFFF" strokeWidth={2.4} />
          )}
        </View>
        <View style={styles.previewCopy}>
          <Text style={styles.previewName}>
            {businessName.trim() || 'Mi negocio'}
          </Text>
          <Text style={styles.previewMeta}>{giro.label} - Gratis Pro $99</Text>
        </View>
      </View>

      <Text style={styles.inputLabel}>Nombre del negocio</Text>
      <TextInput
        onChangeText={onChangeName}
        placeholder="Ej. Barberia El Norte"
        placeholderTextColor="#94A3B8"
        selectionColor="#075CFF"
        style={styles.textInput}
        value={businessName}
      />

      <View style={styles.logoHint}>
        <Text style={styles.logoHintTitle}>Foto o logo opcional</Text>
        <Text style={styles.logoHintText}>
          Puedes agregar una imagen ahora o cambiarla despues desde el perfil.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={choosePhoto}
          style={({ pressed }) => [
            styles.photoButton,
            pressed && styles.pressed,
          ]}
        >
          <ImageIcon size={18} color="#92400E" strokeWidth={2.5} />
          <Text style={styles.photoButtonText}>
            {logoUri ? 'Cambiar foto' : 'Anadir foto'}
          </Text>
        </Pressable>
        {!!photoMessage && (
          <Text style={styles.photoMessage}>{photoMessage}</Text>
        )}
      </View>
    </View>
  );
}

function ProductsStep({
  onAddProduct,
  products,
}: {
  onAddProduct: (product: Product) => void;
  products: Product[];
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  const addProduct = () => {
    const cleanName = name.trim();
    const parsedPrice = Number(price.replace(/[^0-9.]/g, ''));
    const parsedStock = Number(stock.replace(/[^0-9]/g, ''));

    if (!cleanName || parsedPrice <= 0 || parsedStock < 0 || Number.isNaN(parsedStock)) {
      return;
    }

    onAddProduct({
      id: `p-${Date.now()}`,
      name: cleanName,
      category: 'General',
      price: parsedPrice,
      stock: parsedStock,
      minStock: 3,
    });
    setName('');
    setPrice('');
    setStock('');
  };

  return (
    <View style={styles.contentBlock}>
      <Text style={styles.kicker}>Inventario</Text>
      <Text style={styles.title}>Agrega tus primeros productos</Text>
      <Text style={styles.copy}>
        Lo obligatorio es simple: nombre, precio y cantidad. Lo demas puede
        esperar.
      </Text>
      <View style={styles.productTable}>
        <View style={styles.tableHeader}>
          <Text style={styles.tableHead}>Producto</Text>
          <Text style={styles.tableHead}>Precio</Text>
          <Text style={styles.tableHead}>Stock</Text>
        </View>
        {products.length ? (
          products.map((product) => (
            <View key={product.id} style={styles.tableRow}>
              <Text style={styles.tableProduct}>{product.name}</Text>
              <Text style={styles.tableText}>${product.price}</Text>
              <Text style={styles.tableText}>{product.stock}</Text>
            </View>
          ))
        ) : (
          <View style={styles.tableEmptyRow}>
            <Text style={styles.tableEmptyText}>
              Agrega productos reales de tu negocio o continua para cargarlos
              desde inventario.
            </Text>
          </View>
        )}
      </View>
      <View style={styles.quickAddPanel}>
        <Text style={styles.quickAddTitle}>Carga rapida</Text>
        <TextInput
          onChangeText={setName}
          placeholder="Producto"
          placeholderTextColor="#94A3B8"
          style={styles.compactInput}
          value={name}
        />
        <View style={styles.compactRow}>
          <TextInput
            keyboardType="numeric"
            onChangeText={setPrice}
            placeholder="Precio"
            placeholderTextColor="#94A3B8"
            style={[styles.compactInput, styles.compactInputHalf]}
            value={price}
          />
          <TextInput
            keyboardType="numeric"
            onChangeText={setStock}
            placeholder="Cantidad"
            placeholderTextColor="#94A3B8"
            style={[styles.compactInput, styles.compactInputHalf]}
            value={stock}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={addProduct}
          style={({ pressed }) => [
            styles.inlinePrimaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.inlinePrimaryButtonText}>Agregar producto</Text>
        </Pressable>
      </View>
      <View style={styles.limitNote}>
        <Text style={styles.limitNoteText}>
          Gratis: inventario ilimitado, ventas ilimitadas y exportaciones basicas.
        </Text>
      </View>
    </View>
  );
}

function FirstSaleStep() {
  return (
    <View style={styles.contentBlock}>
      <Text style={styles.kicker}>Primera venta</Text>
      <Text style={styles.title}>Asi funciona la caja</Text>
      <Text style={styles.copy}>
        Tutorial dentro de la accion: producto, cantidad, pago, ticket y stock.
      </Text>
      <View style={styles.salePreview}>
        <View style={styles.ticketTop}>
          <Text style={styles.ticketTitle}>Venta V-000023</Text>
          <Text style={styles.ticketStatus}>Pagada</Text>
        </View>
        <SaleLine qty="2x" name="Producto vendido" total="$160" />
        <SaleLine qty="1x" name="Producto adicional" total="$45" />
        <View style={styles.ticketDivider} />
        <View style={styles.ticketTotalRow}>
          <Text style={styles.ticketTotalLabel}>Cobrar</Text>
          <Text style={styles.ticketTotalValue}>$205</Text>
        </View>
        <View style={styles.successList}>
          <SuccessItem text="Inventario descontado" />
          <SuccessItem text="Ticket creado" />
          <SuccessItem text="Resumen actualizado" />
        </View>
      </View>
    </View>
  );
}

function SummaryStep({
  businessName,
  giro,
  productCount,
}: {
  businessName: string;
  giro: Giro;
  productCount: number;
}) {
  return (
    <View style={styles.contentBlock}>
      <Text style={styles.kicker}>Listo</Text>
      <Text style={styles.title}>Ya tienes control diario</Text>
      <Text style={styles.copy}>
        {businessName} inicia en modo {giro.label}. El panel mostrara salud del
        negocio, ventas del dia, inventario y deudas.
      </Text>
      <View style={styles.summaryPanel}>
        <SummaryMetric label="Ventas de hoy" value="$0" />
        <SummaryMetric label="Productos registrados" value={`${productCount}`} />
        <SummaryMetric label="Productos bajos" value="0" />
        <SummaryMetric label="Clientes con deuda" value="0" />
      </View>
      <View style={styles.checklist}>
        <ChecklistItem done text="Nombre del negocio" />
        <ChecklistItem done={productCount > 0} text="Primeros productos" />
        <ChecklistItem done text="Flujo de venta revisado" />
        <ChecklistItem text="Agregar primer cliente" />
      </View>
    </View>
  );
}

function Benefit({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitIcon}>
        <Icon size={20} color="#075CFF" strokeWidth={2.5} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function SaleLine({ name, qty, total }: { name: string; qty: string; total: string }) {
  return (
    <View style={styles.saleLine}>
      <Text style={styles.saleQty}>{qty}</Text>
      <Text style={styles.saleName}>{name}</Text>
      <Text style={styles.saleTotal}>{total}</Text>
    </View>
  );
}

function SuccessItem({ text }: { text: string }) {
  return (
    <View style={styles.successItem}>
      <Check size={15} color="#FFFFFF" strokeWidth={3} />
      <Text style={styles.successText}>{text}</Text>
    </View>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ChecklistItem({ done, text }: { done?: boolean; text: string }) {
  return (
    <View style={styles.checklistItem}>
      {done ? (
        <Check size={18} color="#075CFF" strokeWidth={3} />
      ) : (
        <Circle size={18} color="#94A3B8" strokeWidth={2.3} />
      )}
      <Text style={[styles.checklistText, done && styles.checklistTextDone]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  shell: {
    alignSelf: 'center',
    maxWidth: 430,
    width: '100%',
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    color: '#64748B',
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  progressStep: {
    color: '#075CFF',
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  progressTrack: {
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    height: 8,
    marginBottom: 22,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#075CFF',
    borderRadius: 8,
    height: 8,
  },
  contentBlock: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
  },
  heroMark: {
    alignItems: 'center',
    backgroundColor: '#075CFF',
    borderRadius: 8,
    height: 64,
    justifyContent: 'center',
    marginBottom: 20,
    width: 64,
  },
  kicker: {
    color: '#075CFF',
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0F172A',
    fontSize: 33,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 39,
  },
  copy: {
    color: '#475569',
    fontSize: 15,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 22,
    marginTop: 12,
  },
  benefitStack: {
    gap: 10,
    marginTop: 20,
  },
  benefitRow: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 11,
  },
  benefitIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    marginRight: 10,
    width: 34,
  },
  benefitText: {
    color: '#0F172A',
    flex: 1,
    fontSize: 14,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  giroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 18,
  },
  giroCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D7DEE8',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 82,
    padding: 11,
    width: '48.5%',
  },
  giroCardActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  giroLabel: {
    color: '#0F172A',
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  giroLabelActive: {
    color: '#FFFFFF',
  },
  giroFocus: {
    color: '#64748B',
    fontSize: 11,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    lineHeight: 15,
    marginTop: 5,
  },
  giroFocusActive: {
    color: '#CBD5E1',
  },
  businessPreview: {
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 18,
    padding: 13,
  },
  logoPreview: {
    alignItems: 'center',
    backgroundColor: '#075CFF',
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    width: 54,
  },
  logoPreviewImage: {
    height: '100%',
    width: '100%',
  },
  previewCopy: {
    flex: 1,
  },
  previewName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  previewMeta: {
    color: '#CBD5E1',
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginTop: 4,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D7DEE8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 15,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  logoHint: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  logoHintTitle: {
    color: '#92400E',
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  logoHintText: {
    color: '#92400E',
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 4,
  },
  photoButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FDBA74',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 42,
  },
  photoButtonText: {
    color: '#92400E',
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginLeft: 8,
  },
  photoMessage: {
    color: '#92400E',
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 8,
  },
  productTable: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    overflow: 'hidden',
  },
  tableHeader: {
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  tableHead: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 11,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  tableRow: {
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  tableProduct: {
    color: '#0F172A',
    flex: 1,
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  tableText: {
    color: '#334155',
    flex: 1,
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  tableEmptyRow: {
    paddingHorizontal: 11,
    paddingVertical: 14,
  },
  tableEmptyText: {
    color: '#64748B',
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    lineHeight: 17,
  },
  limitNote: {
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    marginTop: 12,
    padding: 11,
  },
  quickAddPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE8',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  quickAddTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 9,
  },
  compactRow: {
    flexDirection: 'row',
    gap: 8,
  },
  compactInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D7DEE8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 14,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginBottom: 8,
    minHeight: 44,
    paddingHorizontal: 11,
  },
  compactInputHalf: {
    flex: 1,
  },
  inlinePrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
  },
  inlinePrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  limitNoteText: {
    color: '#075CFF',
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 17,
  },
  salePreview: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    marginTop: 18,
    padding: 14,
  },
  ticketTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ticketTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  ticketStatus: {
    color: '#EAF1FF',
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  saleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 34,
  },
  saleQty: {
    color: '#EAF1FF',
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    width: 34,
  },
  saleName: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 13,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  saleTotal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  ticketDivider: {
    backgroundColor: '#334155',
    height: 1,
    marginVertical: 10,
  },
  ticketTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ticketTotalLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  ticketTotalValue: {
    color: '#FFFFFF',
    fontSize: 29,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  successList: {
    gap: 8,
    marginTop: 14,
  },
  successItem: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  successText: {
    color: '#EAF1FF',
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginLeft: 8,
  },
  summaryPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 18,
  },
  summaryMetric: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 74,
    padding: 11,
    width: '48.5%',
  },
  summaryValue: {
    color: '#0F172A',
    fontSize: 20,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginTop: 5,
  },
  checklist: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    gap: 9,
    marginTop: 14,
    padding: 12,
  },
  checklistItem: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  checklistText: {
    color: '#64748B',
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginLeft: 9,
  },
  checklistTextDone: {
    color: '#0F172A',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#075CFF',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE8',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  secondarySpacer: {
    width: 0,
  },
  pressed: {
    opacity: 0.72,
  },
});
