import { Fragment, useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  hasActiveDeposit,
  isActiveDeposit,
  type AdminRevenueEntry,
  type ApiCompany,
  type ApiProject,
  type ApiReview,
  type AuthUser,
  type CompanyPortalRequest,
  type CompanyBranchLocation,
  type LifecycleAdminItem,
  type PolicyReport,
  type VerificationDocument,
  type VerificationDocumentType,
} from '../api/client';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/icons/Icon';
import { Input } from '../components/ui/Input';
import { CompanyAuthForm } from '../components/auth/CompanyAuthForm';
import { RequestChat } from '../components/rfq/RequestChat';
import { MarkViewedOnScreen } from '../components/rfq/MarkViewedOnScreen';
import { SUPPORT_PHONE_PATTERN } from '../lib/supportPhone';
import { Textarea } from '../components/ui/Textarea';
import { FlowHeader } from '../components/layout/FlowHeader';
import { useLanguage } from '../i18n/LanguageProvider';
import { invalidateCompanies } from '../api/useCompanies';
import { useAuth } from '../state/AuthContext';
import { ContractDocumentCard } from '../components/projects/ContractDocumentCard';

type QuoteFields = {
  total: string;
  panelCost: string;
  inverterCost: string;
  batteryCost: string;
  installationCost: string;
  capacity: string;
  panel: string;
  inverter: string;
  battery: string;
  warranty: string;
  days: string;
  valid: string;
  financing: boolean;
  downPayment: string;
  installmentMonths: string;
  monthlyInstallment: string;
  autoCalculateInstallment: boolean;
  greenInitiativeSupported: boolean;
  notes: string;
};

type CompletionFields = {
  title: string;
  description: string;
  installationType: string;
};

/** Companies and admins sign in through the main account login (AuthModal). */
type PortalMode = 'portal' | 'admin' | 'forgot' | 'reset';
type VerificationDocumentFiles = Partial<Record<VerificationDocumentType, File>>;

const IDENTITY_DOCUMENT_TYPES = [
  'national_id',
  'syndicate_card',
  'chamber_id',
  'office_permit',
] as const satisfies readonly VerificationDocumentType[];

const DOCUMENT_LABELS: Record<VerificationDocumentType, { en: string; ar: string }> = {
  national_id: { en: 'National ID', ar: 'البطاقة الوطنية' },
  syndicate_card: { en: 'Engineering Syndicate Card', ar: 'هوية نقابة المهندسين' },
  chamber_id: { en: 'Chamber of Commerce ID', ar: 'هوية غرفة التجارة' },
  office_permit: { en: 'Office Permit', ar: 'إجازة مكتب' },
  business_register: { en: 'Official Business Register / License', ar: 'السجل التجاري الرسمي / إجازة الشركة' },
  project_proof: { en: 'Completed Project Proof', ar: 'إثبات المشاريع المنجزة' },
  license: { en: 'Legacy Business License', ar: 'إجازة النشاط السابقة' },
  tax: { en: 'Tax Registration Certificate', ar: 'شهادة التسجيل الضريبي' },
};

function verificationStage(status: string | undefined): 0 | 1 | 2 {
  if (status === 'verified' || status === 'complete') return 2;
  if (status === 'identity_verified') return 1;
  return 0;
}

function readPasswordResetToken() {
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('reset_token') ?? '';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the completion photo'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the completion photo'));
        return;
      }
      const encoded = reader.result.split(',')[1];
      if (!encoded) {
        reject(new Error('Could not encode the completion photo'));
        return;
      }
      resolve(encoded);
    };
    reader.readAsDataURL(file);
  });
}

function isCompletionImageType(value: string): value is 'image/jpeg' | 'image/png' | 'image/webp' {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function companyRequestSection(request: CompanyPortalRequest): 'incoming' | 'active' | 'completed' {
  const assignment = request.companies[0];
  if (assignment?.completed_projects?.some((project) => project.status === 'completed' || project.status === 'featured')) {
    return 'completed';
  }
  return assignment?.status === 'selected' ? 'active' : 'incoming';
}

function CompanyPasswordInput({
  label,
  name,
  autoComplete,
  minLength,
}: {
  label: string;
  name: string;
  autoComplete: string;
  minLength: number;
}) {
  const { lang } = useLanguage();
  const [visible, setVisible] = useState(false);
  const showLabel = lang === 'ar' ? 'إظهار كلمة المرور' : 'Show password';
  const hideLabel = lang === 'ar' ? 'إخفاء كلمة المرور' : 'Hide password';

  return (
    <Input
      label={label}
      name={name}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      required
      minLength={minLength}
      endAdornment={(
        <button
          type="button"
          title={visible ? hideLabel : showLabel}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="grid h-9 w-9 place-items-center rounded text-content-tertiary hover:bg-bg-subtle hover:text-content-primary"
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size={18} />
        </button>
      )}
    />
  );
}

export function CompanyPortalPage() {
  const { lang } = useLanguage();
  const {
    user,
    token: authToken,
    isLoading: authLoading,
    logout: logoutAuth,
    openAuthModal,
    refreshProfile,
  } = useAuth();
  const ar = lang === 'ar';
  const [resetToken, setResetToken] = useState(readPasswordResetToken);
  const [mode, setMode] = useState<PortalMode>(() => (
    readPasswordResetToken() ? 'reset' : user?.role === 'admin' ? 'admin' : 'portal'
  ));
  const [token, setToken] = useState(() => (
    user?.role === 'company' ? authToken : ''
  ));
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [requests, setRequests] = useState<CompanyPortalRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [quotes, setQuotes] = useState<Record<string, Partial<QuoteFields>>>({});
  const [requestSearch, setRequestSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'all' | 'open' | 'quoted' | 'selected'>('all');
  const [requestGovernorateFilter, setRequestGovernorateFilter] = useState('');
  const [requestDistrictFilter, setRequestDistrictFilter] = useState('');
  const [companyProjectTab, setCompanyProjectTab] = useState<'incoming' | 'active' | 'completed'>('incoming');
  const [technicalEdits, setTechnicalEdits] = useState<Record<string, { roofArea?: string; siteDimensions?: string }>>({});
  const [projectDetailsRequest, setProjectDetailsRequest] = useState<CompanyPortalRequest | null>(null);
  const [completionForms, setCompletionForms] = useState<Record<string, Partial<CompletionFields>>>({});
  const [completionProofFiles, setCompletionProofFiles] = useState<Record<string, File | undefined>>({});
  const [completionErrors, setCompletionErrors] = useState<Record<string, string>>({});
  const [pendingCompanies, setPendingCompanies] = useState<ApiCompany[]>([]);
  const [adminCompanies, setAdminCompanies] = useState<ApiCompany[]>([]);
  const [adminClients, setAdminClients] = useState<AuthUser[]>([]);
  const [adminReviews, setAdminReviews] = useState<ApiReview[]>([]);
  const [adminSection, setAdminSection] = useState<'companies' | 'clients-projects' | 'reviews'>('companies');
  const [adminCompanyTab, setAdminCompanyTab] = useState<'verification' | 'directory'>('verification');
  const [adminClientsProjectsTab, setAdminClientsProjectsTab] = useState<'clients' | 'projects'>('clients');
  const [verificationTab, setVerificationTab] = useState<'pending' | 'approved'>('pending');
  const [adminProjects, setAdminProjects] = useState<ApiProject[]>([]);
  const [adminLifecycle, setAdminLifecycle] = useState<LifecycleAdminItem[]>([]);
  const [adminProjectTab, setAdminProjectTab] = useState<'active' | 'verified'>('active');
  const [adminProofPreview, setAdminProofPreview] = useState<string | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<Record<number, string>>({});
  const [adminRevenue, setAdminRevenue] = useState<AdminRevenueEntry[]>([]);
  const [policyReports, setPolicyReports] = useState<PolicyReport[]>([]);
  const [previewDocument, setPreviewDocument] = useState<VerificationDocument | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Record<number, {
    identity: boolean;
    business: boolean;
    projectProof: boolean;
    license: boolean;
    tax: boolean;
    projects: boolean;
  }>>({});
  const [verificationForm, setVerificationForm] = useState({
    projects: '0',
  });
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [companyBranches, setCompanyBranches] = useState<CompanyBranchLocation[]>([]);
  const [newBranchGovernorate, setNewBranchGovernorate] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [branchesBusy, setBranchesBusy] = useState(false);
  const [companyProfileForm, setCompanyProfileForm] = useState({
    name: '',
    foundedYear: '',
    address: '',
  });
  const [verificationDocuments, setVerificationDocuments] = useState<VerificationDocumentFiles>({});
  const [identityDocumentType, setIdentityDocumentType] = useState<(typeof IDENTITY_DOCUMENT_TYPES)[number]>('national_id');

  useEffect(() => {
    if (user?.role === 'company') setToken(authToken);
    if (user?.role === 'admin') {
      setToken('');
      setMode('admin');
    }
  }, [authToken, user?.role]);

  const text = {
    title: user?.role === 'admin' ? (ar ? 'لوحة إدارة المنصة' : 'Platform administration') : (ar ? 'بوابة شركات الطاقة' : 'Solar company portal'),
    subtitle: user?.role === 'admin'
      ? (ar ? 'راجع طلبات توثيق الشركات وأدر المشاريع باستخدام صلاحية حساب المسؤول.' : 'Review company verification applications and manage projects using your administrator account.')
      : (ar ? 'سجّل شركتك وتابع طلبات عروض الأسعار المرسلة إليك.' : 'Register your company and respond to quote requests sent to you.'),
    name: ar ? 'اسم الشركة' : 'Company name',
    phone: ar ? 'رقم الموبايل الرئيسي' : 'Primary Mobile',
    supportPhone: ar ? 'رقم الدعم السريع للشركة' : 'Company Support Hotline',
    supportPhoneOptional: ar ? 'هاتف الدعم / مركز الاتصال (اختياري)' : 'Support / Call Center Phone (Optional)',
    supportPhoneHelp: ar ? 'مطلوب. أدخل رقم هاتف أو رمز خط الدعم المباشر.' : 'Required. Enter a direct support phone number or hotline code.',
    supportPhoneHelpOptional: ar ? 'اختياري. يقبل موبايل عراقي أو رقم دعم قصير أو خط أرضي.' : 'Optional. Accepts an Iraqi mobile, short support code, or landline.',
    saveContactPhones: ar ? 'حفظ أرقام التواصل' : 'Save contact numbers',
    supportPhoneSaved: ar ? 'تم حفظ أرقام التواصل.' : 'Company contact numbers saved.',
    companyProfileSettings: ar ? 'إعدادات الملف الشخصي والتحقق للشركة' : 'Company Profile & Verification Settings',
    saveCompanyProfile: ar ? 'حفظ الملف الشخصي' : 'Save company profile',
    foundedYear: ar ? 'سنة التأسيس' : 'Year founded',
    verificationStatus: ar ? 'حالة التحقق' : 'Verification status',
    verificationRejected: ar ? 'مرفوض' : 'Verification rejected',
    resubmitVerification: ar ? 'إعادة إرسال طلب التحقق' : 'Re-submit Verification Request',
    profileSaved: ar ? 'تم حفظ الملف الشخصي للشركة.' : 'Company profile saved.',
    verificationResubmitted: ar ? 'تمت إعادة إرسال طلب التحقق إلى الإدارة.' : 'Verification request resubmitted to the admin team.',
    uploadedDocuments: ar ? 'وثائق التحقق المرفوعة' : 'Uploaded verification documents',
    noUploadedDocuments: ar ? 'لا توجد وثائق تحقق مرفوعة بعد.' : 'No verification documents uploaded yet.',
    email: ar ? 'البريد الإلكتروني' : 'Email address',
    password: ar ? 'كلمة المرور (10 أحرف على الأقل)' : 'Password (at least 10 characters)',
    address: ar ? 'المحافظة والعنوان' : 'Governorate and address',
    headquarters: ar ? 'المقر الرئيسي — المحافظة والعنوان' : 'Primary headquarters — governorate and address',
    additionalBranches: ar ? 'الفروع الإضافية' : 'Additional Branches',
    branchGovernorate: ar ? 'المحافظة' : 'Governorate',
    branchAddress: ar ? 'المنطقة / العنوان' : 'Area / address',
    addBranch: ar ? 'إضافة فرع' : 'Add branch',
    removeBranch: ar ? 'إزالة الفرع' : 'Remove branch',
    saveBranches: ar ? 'حفظ الفروع' : 'Save branches',
    branchSaved: ar ? 'تم حفظ الفروع الإضافية.' : 'Additional branches saved.',
    branchRequired: ar ? 'أدخل المحافظة والمنطقة أو العنوان للفرع.' : 'Enter the branch governorate and area or address.',
    license: ar ? 'رقم رخصة النشاط' : 'Business license number',
    tax: ar ? 'رقم التسجيل الضريبي' : 'Tax registration number',
    signedInAsClient: ar
      ? 'أنت داخل بحساب زبون. بوابة الشركات مخصصة لحسابات الشركات فقط.'
      : 'You are signed in with a client account. The company portal is for company accounts only.',
    goToMyRequests: ar ? 'الذهاب إلى طلباتي' : 'Go to my requests',
    switchAccount: ar ? 'تسجيل الخروج والدخول بحساب شركة' : 'Sign out and use a company account',
    inbox: ar ? 'طلبات عروض الأسعار' : 'Quote requests',
    empty: ar ? 'ماكو طلبات مرسلة لشركتك حالياً.' : 'There are no requests for your company yet.',
    logout: ar ? 'تسجيل الخروج' : 'Sign out',
    system: ar ? 'المنظومة المطلوبة' : 'Requested system',
    customer: ar ? 'الزبون' : 'Customer',
    requestLocation: ar ? 'الموقع' : 'Location',
    requestSystemType: ar ? 'نوع النظام' : 'System type',
    requestBudget: ar ? 'الميزانية' : 'Budget',
    greenBudget: ar ? 'ميزانية المبادرة التقديرية' : 'Green Initiative estimated budget',
    requestTimeline: ar ? 'موعد التنفيذ المطلوب' : 'Requested timeline',
    requestNotes: ar ? 'ملاحظات إضافية' : 'Additional notes',
    requestFinancing: ar ? 'يفضل خيارات التقسيط' : 'Financing preferred',
    greenBadge: ar ? 'مبادرة خضراء / Green Initiative' : 'Green Initiative / مبادرة خضراء',
    greenSupport: ar ? 'ندعم توفير مستندات المبادرة الخضراء' : 'Supports Green Initiative documentation',
    greenSupportHelp: ar ? 'أكّد هذا فقط إذا كانت شركتك تستطيع تجهيز المستندات المطلوبة للطلب.' : 'Select only if your company can provide the documentation required for the application.',
    yes: ar ? 'نعم' : 'Yes',
    no: ar ? 'لا' : 'No',
    amount: ar ? 'السعر الكلي بالدينار العراقي' : 'Total price in IQD',
    capacity: ar ? 'القدرة المعروضة (kWp)' : 'Quoted capacity (kWp)',
    panel: ar ? 'ماركة الألواح' : 'Panel brand',
    inverter: ar ? 'ماركة الإنفرتر' : 'Inverter brand',
    battery: ar ? 'ماركة البطارية' : 'Battery brand',
    warranty: ar ? 'تفاصيل الضمان' : 'Warranty terms',
    days: ar ? 'أيام التركيب' : 'Installation days',
    valid: ar ? 'صلاحية العرض بالأيام' : 'Quote validity in days',
    financing: ar ? 'نوفر تقسيط' : 'Financing available',
    financingHelp: ar ? 'تقسيط مباشر من الشركة. حدد الدفعة الأولى والمدة؛ سيحسب النظام القسط الشهري تلقائياً.' : 'Direct installments from your company. Set the down payment and term; the monthly amount is calculated automatically.',
    downPayment: ar ? 'الدفعة الأولى (د.ع)' : 'Down Payment (IQD)',
    installmentMonths: ar ? 'مدة السداد' : 'Repayment Period',
    monthlyInstallment: ar ? 'القسط الشهري (د.ع)' : 'Monthly Installment (IQD)',
    months: ar ? 'أشهر' : 'months',
    useCalculatedInstallment: ar ? 'استخدم القسط المحسوب' : 'Use calculated installment',
    invalidPaymentSchedule: ar ? 'لازم تكون الدفعة الأولى أقل من السعر الكلي.' : 'The down payment must be less than the total price.',
    notes: ar ? 'ملاحظات ضمن العرض' : 'Quote notes',
    send: ar ? 'إرسال العرض' : 'Send quote',
    sent: ar ? 'تم حفظ العرض وإرساله للزبون.' : 'Quote saved and sent to the customer.',
    completionTitle: ar ? 'تسجيل اكتمال التركيب' : 'Record completed installation',
    installationTitle: ar ? 'اسم المشروع' : 'Project title',
    installationType: ar ? 'نوع التركيب المنفذ' : 'Installation type',
    installationDescription: ar ? 'ملخص التنفيذ' : 'Installation summary',
    completeInstallation: ar ? 'إرسال طلب إنهاء المشروع' : 'Submit Completion Request to Admin',
    completionPhoto: ar ? 'صورة إثبات التنفيذ (مطلوبة)' : 'Execution proof photo (required)',
    signContract: ar ? 'توقيع العقد وإرساله إلى الأدمن' : 'Sign & Submit Contract to Admin',
    waitingContractSignature: ar ? 'بانتظار توقيع الطرفين على العقد.' : 'Waiting for both parties to sign the contract.',
    awaitingAdminStart: ar ? 'تم توقيع العقد من الطرفين؛ بانتظار إذن الأدمن للمباشرة.' : 'Both parties signed; awaiting admin work authorization.',
    workAuthorizedNotification: 'تمت موافقة الأدمن على العقد والمباشرة بالعمل. يمكن للشركة الآن البدء بتنفيذ المشروع.',
    workAuthorizedTitle: ar ? 'أذن العمل / جاهز للتركيب' : 'Work Authorized / Ready for Installation',
    awaitingAdminCompletion: ar ? 'تم إرسال طلب الإنجاز إلى الأدمن للمراجعة.' : 'Completion request submitted for admin verification.',
    completionPhotoRequired: ar ? 'ارفع صورة التنفيذ قبل إرسال طلب الإنجاز.' : 'Upload the execution proof photo before submitting completion.',
    completionInvalid: ar
      ? 'أدخل اسم المشروع ونوع التركيب بحرفين على الأقل لكل حقل قبل التسجيل.'
      : 'Enter a project title and installation type with at least 2 characters each.',
    waitingForAcceptance: ar
      ? 'أرسلت العرض. انتظر موافقة الزبون على عرضك قبل تسجيل إكمال التركيب.'
      : 'Quote sent. Wait for the customer to accept your offer before recording the installation as complete.',
    installationCompleted: ar ? 'تم إرسال الإنجاز إلى الإدارة للتدقيق.' : 'Completion submitted for admin verification.',
    contractInProgress: ar ? 'العقد مبرم والتركيب قيد التنفيذ' : 'Contract executed and installation in progress',
    completionPending: ar ? 'الإنجاز بانتظار موافقة الإدارة' : 'Completion claim pending admin review',
    changesRequested: ar ? 'طلبت الإدارة تعديلات على إثبات الإنجاز' : 'Admin requested changes to the completion proof',
    activeProjects: ar ? 'المشاريع النشطة' : 'In-Progress Projects',
    completedPortfolio: ar ? 'محفظة المشاريع المكتملة' : 'Completed Portfolio',
    incomingRfqs: ar ? 'طلبات عروض الأسعار الواردة' : 'Incoming RFQs',
    projectCompleted: ar ? 'التركيب مكتمل' : 'Installation completed',
    loadQueue: ar ? 'عرض طلبات التسجيل' : 'Load applications',
    adminAccessNotice: ar
      ? 'أنت مسجل الدخول بحساب مسؤول. تُحمى إجراءات الإدارة بصلاحية حسابك ولا تحتاج إلى إدخال رمز سري منفصل.'
      : 'You are signed in with an administrator account. Admin actions use your account permissions; no separate secret token is needed.',
    portfolio: ar ? 'مشاريع المحفظة' : 'Portfolio projects',
    revenueTitle: ar ? 'حساب العمولة والمنصة' : 'Commission & Platform Revenue',
    noRevenue: ar ? 'لا توجد عروض مقبولة أو مشاريع منجزة مسجلة بعد.' : 'No accepted quotes or completed projects have been recorded yet.',
    acceptedQuoteCount: ar ? 'العروض المقبولة' : 'Accepted quotes',
    acceptedQuoteValue: ar ? 'قيمة العروض المقبولة' : 'Accepted quote value',
    commissionTotal: ar ? 'إجمالي العمولة المقدرة' : 'Estimated total commission',
    agreedPrice: ar ? 'السعر المتفق عليه' : 'Total agreed price',
    commissionFee: ar ? 'عمولة المنصة (٥٪)' : 'Platform commission (5%)',
    revenueStatus: ar ? 'حالة الدفع والعمولة' : 'Payment & commission status',
    projectTitle: ar ? 'اسم المشروع' : 'Project title',
    acceptedRevenue: ar ? 'مقبول' : 'Accepted',
    completedRevenue: ar ? 'مكتمل' : 'Completed',
    paymentTracking: ar ? 'دفعة العربون' : 'Deposit payment',
    transactionId: ar ? 'رقم المعاملة' : 'Transaction ID',
    commissionCollected: ar ? 'عربون تجريبي — لم يُحصَّل أي مبلغ' : 'Demo deposit — nothing collected',
    commissionPending: ar ? 'بانتظار الدفع' : 'Awaiting deposit',
    refundedStatus: ar ? 'تم إرجاع العربون' : 'Refunded',
    refundDeposit: ar ? 'إرجاع العربون' : 'Refund deposit',
    refundComplete: ar ? 'تم تسجيل إرجاع العربون التجريبي.' : 'Mock deposit refund recorded.',
    refundFailed: ar ? 'تعذر تسجيل الإرجاع.' : 'Could not record the refund.',
    depositConfirmed: ar
      ? 'تم تأكيد العربون وفتح معلومات التواصل. يبقى بدء العمل مشروطاً بتوقيع الطرفين وموافقة الأدمن.'
      : 'Deposit confirmed and contact details unlocked. Work still requires both signatures and admin approval.',
    depositValue: ar ? 'العربون' : 'Deposit',
    balanceValue: ar ? 'المتبقي' : 'Balance remaining',
    simulatedPaymentNote: ar ? 'الدفع محاكاة تجريبية ولا يتصل بمصرف أو مزود دفع.' : 'Payment is simulated and does not connect to a bank or payment provider.',
    reportsTitle: ar ? 'إدارة البلاغات والمخالفات' : 'Policy Reports & Chat Violations',
    noReports: ar ? 'لا توجد بلاغات أو مخالفات مسجلة.' : 'No policy reports or chat violations have been reported.',
    verificationApplications: ar ? 'طلبات التوثيق' : 'Verification Applications',
    pendingApplications: ar ? 'طلبات التوثيق المعلّقة' : 'Pending Verification Applications',
    approvedApplications: ar ? 'سجل الطلبات المعتمدة' : 'Approved Applications History',
    projectsManagement: ar ? 'إدارة المشاريع' : 'Projects Management',
    companiesManagement: ar ? 'دليل الشركات وإدارتها' : 'Companies Directory & Management',
    clientsManagement: ar ? 'إدارة الزبائن' : 'Clients Management',
    reviewsManagement: ar ? 'إدارة التقييمات' : 'Reviews Management',
    blockCompany: ar ? 'حظر الشركة' : 'Block Company',
    unblockCompany: ar ? 'إلغاء حظر الشركة' : 'Unblock Company',
    blockClient: ar ? 'حظر الزبون' : 'Block Client',
    unblockClient: ar ? 'إلغاء حظر الزبون' : 'Unblock Client',
    hideReview: ar ? 'إخفاء التقييم' : 'Hide Review',
    showReview: ar ? 'إظهار التقييم' : 'Show Review',
    deleteReview: ar ? 'حذف التقييم' : 'Delete Review',
    noCompanies: ar ? 'لا توجد شركات مسجلة.' : 'No registered companies.',
    noClients: ar ? 'لا يوجد زبائن مسجلون.' : 'No registered clients.',
    noReviews: ar ? 'لا توجد تقييمات.' : 'No reviews.',
    registered: ar ? 'تاريخ التسجيل' : 'Registered',
    companyProjects: ar ? 'مشاريع الشركة' : 'Company projects',
    confirmDeleteReview: ar ? 'هل تريد حذف هذا التقييم نهائياً؟' : 'Delete this review permanently?',
    reviewDeleted: ar ? 'تم حذف التقييم.' : 'Review deleted.',
    companyStatus: ar ? 'حالة التوثيق' : 'Verification status',
    companyBlocked: ar ? 'محظورة' : 'Blocked',
    companyActive: ar ? 'نشطة' : 'Active',
    rejectedStatus: ar ? 'مرفوضة' : 'Rejected',
    clientBlocked: ar ? 'محظور' : 'Blocked',
    clientActive: ar ? 'نشط' : 'Active',
    reviewHidden: ar ? 'مخفي عن العرض العام' : 'Hidden from public display',
    reviewVisible: ar ? 'ظاهر للعامة' : 'Visible to the public',
    reportPending: ar ? 'قيد الانتظار' : 'Pending',
    reportResolved: ar ? 'تم الحل' : 'Resolved',
    reportDismissed: ar ? 'مرفوض' : 'Dismissed',
    resolveReport: ar ? 'حل البلاغ' : 'Resolve',
    dismissReport: ar ? 'استبعاد' : 'Dismiss',
    viewDocument: ar ? 'معاينة الوثيقة' : 'View Document',
    documentUnavailable: ar ? 'لم تُرفق وثيقة' : 'No document uploaded',
    uploadDocument: ar ? 'إرفاق ملف PDF أو صورة (حد أقصى 3 ميغابايت)' : 'Attach PDF or image (3 MB maximum)',
    closePreview: ar ? 'إغلاق المعاينة' : 'Close preview',
    noPortfolioProjects: ar ? 'لا توجد مشاريع مسجلة.' : 'No projects have been recorded.',
    approve: ar ? 'موافقة' : 'Approve',
    reject: ar ? 'رفض' : 'Reject',
    noApplications: ar ? 'ماكو طلبات تسجيل معلّقة.' : 'No pending company applications.',
    panelCost: ar ? 'كلفة الألواح (د.ع)' : 'Solar panels cost (IQD)',
    inverterCost: ar ? 'كلفة الإنفرتر (د.ع)' : 'Inverter cost (IQD)',
    batteryCost: ar ? 'كلفة البطارية (د.ع)' : 'Battery cost (IQD)',
    installationCost: ar ? 'كلفة التنصيب والتشغيل (د.ع)' : 'Installation and commissioning cost (IQD)',
    itemizedTotal: ar ? 'مجموع البنود' : 'Itemized total',
    itemizedMismatch: ar ? 'لازم يساوي السعر الكلي مجموع بنود التسعير.' : 'The total price must equal the sum of the itemized costs.',
    verificationRequired: ar ? 'إرسال العروض يتطلب اعتماد الهوية أو المكتب من الإدارة بعد رفع الوثيقة أو مراجعتها يدوياً.' : 'Quote submissions require admin approval of your identity or office document.',
    phoneAfterDeposit: ar ? 'رقم الزبون يظهر بعد دفع العربون' : 'Phone shown after the customer pays the deposit',
    quoteLocked: ar ? 'قبل الزبون عرضك، لذلك لا يمكن تعديل السعر أو الشروط.' : 'The customer accepted your quote, so the price and terms can no longer be changed.',
    pendingRequestPrompt: ar
      ? 'لقد استلمت طلب عرض سعر مباشر من زبون! يرجى رفع وثائق الإثبات لتفعيل حسابتك بالكامل وتوقيع العقود.'
      : 'You have received a direct quote request from a customer! Upload verification documents to fully activate your account and become eligible to sign contracts.',
    unverifiedCompany: ar ? 'غير موثّقة' : 'Unverified',
    identityApproved: ar ? 'تم اعتماد الهوية أو المكتب' : 'Identity or office approved',
    verificationComplete: ar ? 'اكتمل توثيق الشركة' : 'Company verification complete',
    unverifiedPrompt: ar ? 'ارفع البطاقة الوطنية أو هوية نقابة المهندسين أو غرفة التجارة أو إجازة المكتب. تفعيل تقديم العروض يتطلب مراجعة الإدارة.' : 'Upload a National ID, Engineering Syndicate Card, Chamber of Commerce ID, or Office Permit. Admin review is required to unlock quoting.',
    identityApprovedPrompt: ar ? 'تم اعتماد الهوية ويمكنك تقديم العروض. ارفع السجل التجاري وشهادة التسجيل الضريبي وإثبات المشاريع المنجزة لإكمال توثيق الشركة.' : 'Identity approved. You can submit quotes. Upload the official business register, tax certificate, and completed-project evidence to complete company verification.',
    verificationCompletePrompt: ar ? 'اكتمل توثيق شركتك.' : 'Your company verification is complete.',
    verificationPendingPrompt: ar ? 'طلب التحقق الخاص بك قيد المراجعة حالياً من قبل الإدارة.' : 'Your verification request is currently under Admin review.',
    verificationRejectedPrompt: ar ? 'تم رفض طلب التحقق. حدّث الوثائق المطلوبة أدناه ثم أعد إرسالها لمراجعة الإدارة.' : 'Your verification was rejected. Update the requested documents below and resubmit them for admin review.',
    identityDocument: ar ? 'وثيقة الهوية أو المكتب' : 'Identity or office document',
    identityDocumentChecked: ar ? 'تمت مراجعة وثيقة الهوية / المكتب' : 'Identity / office document reviewed',
    businessRegister: ar ? 'السجل التجاري / إجازة رسمية' : 'Official Business Register / License',
    projectProof: ar ? 'إثبات المشاريع المنجزة' : 'Proof of completed projects',
    completedProjectsCount: ar ? 'مشاريع منجزة مسجلة' : 'Recorded completed projects',
    approveCompany: ar ? 'اعتماد التوثيق' : 'Approve Verification',
    sessionExpired: ar ? 'انتهت جلسة الإدارة. سجّل الدخول مرة ثانية للمتابعة.' : 'Your admin session expired. Sign in again to continue.',
    noDocuments: ar ? 'لم تُرفع وثائق تحقق بعد.' : 'No verification documents have been uploaded.',
    identityReviewRequired: ar ? 'حدد مربع مراجعة الهوية أو المكتب لاعتماد الهوية.' : 'Check the identity / office review to approve the identity.',
    companyReviewRequired: ar ? 'حدد مربعات مراجعة الهوية والسجل التجاري وإثبات المشاريع لاعتماد توثيق الشركة.' : 'Check identity, business register, and completed-project evidence reviews to approve company verification.',
    identityFileRequired: ar ? 'اختر وثيقة هوية أو مكتب قبل إرسال الطلب.' : 'Choose an identity or office document before submitting.',
    companyFilesRequired: ar ? 'أرفق السجل التجاري وشهادة التسجيل الضريبي وإثبات ثلاثة مشاريع منجزة على الأقل.' : 'Attach the business register, tax certificate, and proof of at least 3 completed projects.',
    rejectedApplication: ar ? 'رفض الطلب' : 'Reject application',
    searchRequests: ar ? 'ابحث برقم الطلب أو المحافظة أو المنطقة' : 'Search request, governorate, or district',
    filterRequests: ar ? 'حالة الطلب' : 'Request status',
    allRequests: ar ? 'كل الطلبات' : 'All requests',
    openRequests: ar ? 'بانتظار عرض' : 'Awaiting quote',
    quotedRequests: ar ? 'تم إرسال عرض' : 'Quote submitted',
    selectedRequests: ar ? 'تم اختيار الشركة' : 'Company selected',
    noMatchingRequests: ar ? 'ماكو طلبات تطابق البحث أو التصفية.' : 'No requests match these filters.',
    incomingRfqsTab: ar ? 'طلبات عروض الأسعار الواردة' : 'Incoming RFQs',
    activeProjectsTab: ar ? 'المشاريع قيد التنفيذ' : 'In-Progress Projects',
    completedPortfolioTab: ar ? 'الأعمال المكتملة' : 'Completed Portfolio',
    filterGovernorate: ar ? 'المحافظة' : 'Governorate',
    filterDistrict: ar ? 'المنطقة' : 'District',
    allLocations: ar ? 'كل المواقع' : 'All locations',
    viewProjectDetails: ar ? 'عرض تفاصيل المشروع' : 'View Project Details',
    projectDetails: ar ? 'تفاصيل المشروع' : 'Project Details',
    technicalSpecifications: ar ? 'المواصفات الفنية' : 'Technical specifications',
    contractHistory: ar ? 'سجل العقد والحالة' : 'Contract & status history',
    roofArea: ar ? 'مساحة السطح' : 'Roof Surface Area',
    siteDimensions: ar ? 'أبعاد الموقع' : 'Site Dimensions',
    updateTechnicalDetails: ar ? 'حفظ التعديلات الفنية' : 'Save technical updates',
    technicalDetailsSaved: ar ? 'تم تحديث التفاصيل الفنية.' : 'Technical details updated.',
    customerDetails: ar ? 'بيانات الزبون' : 'Customer details',
    optional: ar ? 'اختياري' : 'Optional',
    recoveryTitle: ar ? 'استعادة كلمة المرور' : 'Password recovery',
    newPassword: ar ? 'كلمة المرور الجديدة' : 'New password',
    confirmPassword: ar ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password',
    sendResetLink: ar ? 'إرسال رابط الاستعادة' : 'Send reset link',
    resetPassword: ar ? 'تغيير كلمة المرور' : 'Update password',
    backToSignIn: ar ? 'العودة لتسجيل الدخول' : 'Back to sign in',
    resetRequested: ar
      ? 'إذا كان البريد مرتبطاً بحساب شركة، راح توصلك رسالة برابط صالح لمدة 30 دقيقة.'
      : 'If this email belongs to a company account, a reset link will arrive and expire in 30 minutes.',
    passwordResetUnavailable: ar
      ? 'استعادة كلمة المرور غير مفعّلة حالياً لأن خدمة البريد غير مهيأة. عنوان بريدك مو سبب المشكلة.'
      : 'Password recovery is unavailable because the email service is not configured. Your email address is not the problem.',
    invalidCredentials: ar
      ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      : 'Email or password is incorrect.',
    resetComplete: ar ? 'تم تغيير كلمة المرور. سجّل الدخول بكلمتك الجديدة.' : 'Password updated. Sign in with your new password.',
    passwordsMismatch: ar ? 'كلمتا المرور غير متطابقتين.' : 'The passwords do not match.',
    invalidResetLink: ar ? 'رابط الاستعادة غير صالح أو منتهي. اطلب رابطاً جديداً.' : 'This reset link is missing or expired. Request a new one.',
    projects: ar ? 'عدد المشاريع المنجزة' : 'Completed projects',
    verificationRule: ar
      ? 'تبدأ الموافقة بمراجعة الهوية أو المكتب لإتاحة تقديم العروض؛ ويكتمل توثيق الشركة بمراجعة السجل التجاري وإثبات 3 مشاريع منجزة.'
      : 'Identity or office review unlocks quotes. Complete company verification requires an official business register and proof of 3 completed projects.',
    checkLicense: ar ? 'تم تدقيق الرخصة الأصلية' : 'Original license checked',
    checkTax: ar ? 'تم تدقيق السجل الضريبي الأصلي' : 'Original tax record checked',
    checkProjects: ar ? 'تم تدقيق إثبات 3 مشاريع منجزة أو أكثر' : 'Evidence for 3+ completed projects checked',
    needLicense: ar ? 'أدخل رقم رخصة النشاط.' : 'Enter the business license number.',
    needTax: ar ? 'أدخل رقم التسجيل الضريبي.' : 'Enter the tax registration number.',
    needThreeProjects: ar ? 'سجّل 3 مشاريع منجزة على الأقل.' : 'Record at least 3 completed projects.',
    verifyLicense: ar ? 'أكّد تدقيق الرخصة الأصلية.' : 'Confirm that the original license was checked.',
    verifyTax: ar ? 'أكّد تدقيق السجل الضريبي الأصلي.' : 'Confirm that the original tax record was checked.',
    verifyProjects: ar ? 'أكّد تدقيق إثبات المشاريع المنجزة.' : 'Confirm that evidence for completed projects was checked.',
    applicationSaved: ar ? 'تم إرسال بيانات التحقق للإدارة.' : 'Verification details sent for admin review.',
    saveApplication: ar ? 'إرسال بيانات التحقق' : 'Submit verification details',
    refreshFailed: ar ? 'تعذر تحديث الطلبات حالياً. حاول مرة ثانية بعد قليل.' : 'Could not refresh requests right now. Please try again shortly.',
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let pollingTimer: number | undefined;
    api.companyProfile(token)
      .then(async (profile) => {
        if (cancelled) return;
        setCompany(profile);
        setCompanyBranches(profile.branches ?? []);
        setPrimaryPhone(profile.phone ?? '');
        setSupportPhone(profile.support_phone ?? '');
        setCompanyProfileForm({
          name: profile.name,
          foundedYear: String(profile.founded_year ?? ''),
          address: profile.address ?? '',
        });
        setVerificationForm({
          projects: String(profile.projects_count ?? 0),
        });
        // Customer requests open only after identity verification is approved.
        if (verificationStage(profile.verification_status) < 1) {
          setRequests([]);
          return;
        }
        const inbox = await api.companyInbox(token);
        if (cancelled) return;
        setRequests(inbox);
        setCompanyProjectTab(
          inbox.some((request) => companyRequestSection(request) === 'incoming')
            ? 'incoming'
            : inbox.some((request) => companyRequestSection(request) === 'active')
              ? 'active'
              : 'completed',
        );
        pollingTimer = window.setInterval(() => {
          api.companyInbox(token)
            .then((updatedInbox) => {
              if (!cancelled) setRequests(updatedInbox);
            })
            .catch((cause) => {
              if (!cancelled) {
                console.warn('[utu] could not refresh company requests:', cause);
                setError(text.refreshFailed);
              }
            });
        }, 10_000);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          setToken('');
          logoutAuth();
          setError(ar ? 'انتهت الجلسة. سجّل الدخول مرة ثانية.' : 'Your session expired. Please sign in again.');
          return;
        }
        console.warn('[utu] could not load company portal data:', cause);
        setError(text.refreshFailed);
      });
    return () => {
      cancelled = true;
      if (pollingTimer !== undefined) window.clearInterval(pollingTimer);
    };
  }, [token, ar, authToken, logoutAuth, user?.role]);

  useEffect(() => {
    const navigateToNotificationTarget = () => {
      const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      if (params.get('verification') === '1') {
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLElement>('[data-notification-verification]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return;
      }

      const requestId = params.get('requestId');
      const projectId = params.get('projectId');
      const targetRequest = requests.find((request) => (
        (requestId && request.group_id === requestId)
        || (projectId && request.companies.some((assignment) =>
          assignment.completed_projects?.some((project) => String(project.id) === projectId),
        ))
      ));
      if (!targetRequest) return;
      const targetTab = companyRequestSection(targetRequest);
      if (
        requestSearch
        || requestStatusFilter !== 'all'
        || requestGovernorateFilter
        || requestDistrictFilter
        || companyProjectTab !== targetTab
      ) {
        setRequestSearch('');
        setRequestStatusFilter('all');
        setRequestGovernorateFilter('');
        setRequestDistrictFilter('');
        setCompanyProjectTab(targetTab);
        return;
      }

      window.requestAnimationFrame(() => {
        const target = params.get('payment') === '1'
          ? document.querySelector<HTMLElement>(`[data-notification-payment="${targetRequest.group_id}"]`)
          : Array.from(document.querySelectorAll<HTMLElement>('[data-notification-request-id]'))
            .find((element) => element.dataset.notificationRequestId === targetRequest.group_id);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    };
    navigateToNotificationTarget();
    window.addEventListener('hashchange', navigateToNotificationTarget);
    return () => window.removeEventListener('hashchange', navigateToNotificationTarget);
  }, [
    companyProjectTab,
    requestDistrictFilter,
    requestGovernorateFilter,
    requestSearch,
    requestStatusFilter,
    requests,
  ]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        await api.requestCompanyPasswordReset(String(form.get('email')));
        setMode('portal');
        setNotice(text.resetRequested);
      } else if (mode === 'reset') {
        const newPassword = String(form.get('new_password'));
        if (!resetToken) throw new Error(text.invalidResetLink);
        if (newPassword !== String(form.get('confirm_password'))) {
          throw new Error(text.passwordsMismatch);
        }
        await api.confirmCompanyPasswordReset(resetToken, newPassword);
        // The reset signs out every session of the account; sign in again.
        setToken('');
        setResetToken('');
        window.location.hash = '#/company';
        setNotice(text.resetComplete);
        setMode('portal');
        logoutAuth();
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Request failed';
      setError(
        message === 'Company password recovery email is not configured'
          ? text.passwordResetUnavailable
          : message === 'Email or password is incorrect'
            ? text.invalidCredentials
            : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const setQuoteField = (groupId: string, key: keyof QuoteFields, value: string | boolean) => {
  setQuotes((current) => {
    const previous = current[groupId] ?? {};
    if (key === 'downPayment' || key === 'installmentMonths' || key === 'total') {
      return {
        ...current,
        [groupId]: {
          ...previous,
          [key]: value,
          monthlyInstallment: '',
          autoCalculateInstallment: true,
        },
      };
    }
    if (key === 'monthlyInstallment') {
      return {
        ...current,
        [groupId]: {
          ...previous,
          monthlyInstallment: String(value),
          autoCalculateInstallment: false,
        },
      };
    }
    return { ...current, [groupId]: { ...previous, [key]: value } };
  });
  };

  const submitQuote = async (event: FormEvent<HTMLFormElement>, request: CompanyPortalRequest) => {
    event.preventDefault();
    if (!company) return;
    const values = quotes[request.group_id] ?? {};
    const existingQuote = request.companies[0]?.quote;
    const totalIqd = Number(values.total ?? existingQuote?.total_iqd ?? 0);
    const financing = values.financing ?? existingQuote?.financing ?? false;
    const downPaymentIqd = Number(
      values.downPayment ?? existingQuote?.down_payment_iqd ?? 0,
    );
    const installmentMonths = Number(
      values.installmentMonths ?? existingQuote?.installment_months ?? 12,
    );
    const calculatedMonthlyInstallment = totalIqd > downPaymentIqd && installmentMonths > 0
      ? Math.max(1, Math.round((totalIqd - downPaymentIqd) / installmentMonths))
      : 0;
    const monthlyInstallmentIqd = values.autoCalculateInstallment === false
      ? Number(values.monthlyInstallment || existingQuote?.monthly_installment_iqd || calculatedMonthlyInstallment)
      : calculatedMonthlyInstallment;
    const itemized = {
      panel_iqd: Number(values.panelCost ?? existingQuote?.panel_iqd ?? 0),
      inverter_iqd: Number(values.inverterCost ?? existingQuote?.inverter_iqd ?? 0),
      battery_iqd: Number(values.batteryCost ?? existingQuote?.battery_iqd ?? 0),
      installation_iqd: Number(values.installationCost ?? existingQuote?.installation_iqd ?? 0),
    };
    const itemizedTotal = Object.values(itemized).reduce((total, amount) => total + amount, 0);
    if (itemizedTotal <= 0 || itemizedTotal !== totalIqd) {
      setError(text.itemizedMismatch);
      return;
    }
    if (financing && (downPaymentIqd < 0 || downPaymentIqd >= totalIqd)) {
      setError(text.invalidPaymentSchedule);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const quote = await api.submitCompanyQuote(token, request.group_id, company.id, {
        total_iqd: totalIqd,
        ...itemized,
        capacity_kwp: Number(values.capacity ?? existingQuote?.capacity_kwp ?? request.system_kwp),
        panel_brand: values.panel ?? existingQuote?.panel_brand ?? '',
        inverter_brand: values.inverter ?? existingQuote?.inverter_brand ?? '',
        battery_brand: values.battery ?? existingQuote?.battery_brand ?? '',
        warranty: values.warranty ?? existingQuote?.warranty ?? '',
        install_days: Number(values.days ?? existingQuote?.install_days ?? 0),
        valid_days: Number(values.valid ?? existingQuote?.valid_days ?? 14),
        financing,
        ...(financing ? {
          down_payment_iqd: downPaymentIqd,
          installment_months: installmentMonths,
          monthly_installment_iqd: monthlyInstallmentIqd,
        } : {}),
        green_initiative_supported: values.greenInitiativeSupported ?? existingQuote?.green_initiative_supported ?? false,
        notes: values.notes ?? existingQuote?.notes ?? '',
      });
      setRequests((current) => current.map((item) => item.group_id !== request.group_id ? item : {
        ...item,
        companies: item.companies.map((recipient) => ({ ...recipient, status: 'quoted', quote })),
      }));
      setNotice(text.sent);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const setCompletionField = (groupId: string, key: keyof CompletionFields, value: string) => {
    setCompletionForms((current) => ({
      ...current,
      [groupId]: { ...current[groupId], [key]: value },
    }));
    setCompletionErrors((current) => ({ ...current, [groupId]: '' }));
  };

  const completeInstallation = async (
    event: FormEvent<HTMLFormElement>,
    request: CompanyPortalRequest,
  ) => {
    event.preventDefault();
    const values = completionForms[request.group_id] ?? {};
    const proofFile = completionProofFiles[request.group_id];
    if ((values.title ?? '').trim().length < 2 || (values.installationType ?? '').trim().length < 2) {
      setCompletionErrors((current) => ({
        ...current,
        [request.group_id]: text.completionInvalid,
      }));
      return;
    }
    if (!proofFile) {
      setCompletionErrors((current) => ({
        ...current,
        [request.group_id]: text.completionPhotoRequired,
      }));
      return;
    }
    if (!isCompletionImageType(proofFile.type) || proofFile.size > 3 * 1024 * 1024) {
      setCompletionErrors((current) => ({
        ...current,
        [request.group_id]: ar
          ? 'الصيغ المدعومة JPG وPNG وWebP وبحجم أقصى 3 MB.'
          : 'Use a JPG, PNG, or WebP image up to 3 MB.',
      }));
      return;
    }
    setCompletionErrors((current) => ({ ...current, [request.group_id]: '' }));
    setBusy(true);
    setError('');
    try {
      const proofData = await fileToBase64(proofFile);
      const project = await api.completeCompanyInstallation(token, request.group_id, {
        title: values.title ?? '',
        description: values.description ?? '',
        installation_type: values.installationType ?? '',
        proof_data_base64: proofData,
        proof_content_type: proofFile.type,
        proof_file_name: proofFile.name,
      });
      setRequests((current) => current.map((item) => item.group_id !== request.group_id ? item : {
        ...item,
        companies: item.companies.map((assignment) => assignment.company_id !== project.company_id
          ? assignment
          : {
              ...assignment,
              lifecycle_status: 'pending_review',
              lifecycle_project_id: project.id,
              has_completion_proof: true,
              admin_feedback: null,
            }),
      }));
      setCompletionProofFiles((current) => ({ ...current, [request.group_id]: undefined }));
      setNotice(text.installationCompleted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const signCompanyContract = async (request: CompanyPortalRequest) => {
    const assignment = request.companies[0];
    if (!token || !assignment?.contract) return;
    setBusy(true);
    setError('');
    try {
      const signature = await api.signCompanyContract(token, request.group_id, assignment.company_id);
      setRequests((current) => current.map((item) => item.group_id !== request.group_id ? item : {
        ...item,
        companies: item.companies.map((entry) => entry.company_id !== assignment.company_id
          ? entry
          : {
              ...entry,
              lifecycle_status: signature.lifecycle_status,
              customer_contract_signed: signature.customer_contract_signed,
              company_contract_signed: signature.company_contract_signed,
              contract: entry.contract
                ? {
                    ...entry.contract,
                    signatures: {
                      ...entry.contract.signatures,
                      customer_signed: signature.customer_contract_signed,
                      company_signed: signature.company_contract_signed,
                    },
                  }
                : entry.contract,
            }),
      }));
      setNotice(signature.lifecycle_status === 'awaiting_admin_approval'
        ? (ar ? 'وقّع الطرفان العقد وأُرسل إلى الأدمن لإذن المباشرة.' : 'Both parties signed; contract submitted for admin work authorization.')
        : (ar ? 'تم توقيع العقد وإرساله إلى الأدمن.' : 'Contract signed and submitted to the administrator.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign the contract');
    } finally {
      setBusy(false);
    }
  };

  const loadAdminQueue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const [companies, allCompanies, users, reviews, projects, lifecycle, revenue, reports] = await Promise.all([
        api.adminPendingCompanies(),
        api.adminAllCompanies(),
        api.adminUsers(),
        api.adminReviews(),
        api.listProjects(),
        api.listAdminLifecycle(),
        api.adminRevenue(),
        api.adminPolicyReports(),
      ]);
      setPendingCompanies(companies);
      setAdminCompanies(allCompanies);
      setAdminClients(users.filter((account) => account.role === 'client'));
      setAdminReviews(reviews);
      setAdminProjects(projects);
      setAdminLifecycle(lifecycle);
      setAdminRevenue(revenue);
      setPolicyReports(reports);
      setReviewChecks({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const openVerificationDocument = async (
    companyId: number,
    documentType: VerificationDocument['document_type'],
  ) => {
    setBusy(true);
    setError('');
    try {
      setPreviewDocument(await api.adminVerificationDocument(companyId, documentType));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load verification document');
    } finally {
      setBusy(false);
    }
  };

  const updateReportStatus = async (
    reportId: number,
    status: Exclude<PolicyReport['status'], 'pending'>,
  ) => {
    setBusy(true);
    setError('');
    try {
      const updatedReport = await api.updatePolicyReportStatus(reportId, status);
      setPolicyReports((reports) => reports.map((report) => (
        report.id === reportId ? updatedReport : report
      )));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update report status');
    } finally {
      setBusy(false);
    }
  };

  const setCompanyBlocked = async (company: ApiCompany) => {
    setBusy(true);
    setError('');
    try {
      const updated = await api.setAdminCompanyBlocked(company.id, !company.is_blocked);
      setAdminCompanies((items) => items.map((item) => item.id === updated.id ? updated : item));
      invalidateCompanies();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update company access');
    } finally {
      setBusy(false);
    }
  };

  const setClientBlocked = async (client: AuthUser) => {
    setBusy(true);
    setError('');
    try {
      const updated = await api.setAdminClientActive(client.id, !client.is_active);
      setAdminClients((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update client access');
    } finally {
      setBusy(false);
    }
  };

  const setReviewHidden = async (review: ApiReview) => {
    setBusy(true);
    setError('');
    try {
      const updated = await api.setAdminReviewHidden(review.id, !review.is_hidden);
      setAdminReviews((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update review visibility');
    } finally {
      setBusy(false);
    }
  };

  const deleteAdminReview = async (reviewId: number) => {
    if (!window.confirm(text.confirmDeleteReview)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteAdminReview(reviewId);
      setAdminReviews((items) => items.filter((item) => item.id !== reviewId));
      setNotice(text.reviewDeleted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete review');
    } finally {
      setBusy(false);
    }
  };

  const refundAdminDeposit = async (entry: AdminRevenueEntry) => {
    if (entry.assignment_id == null || !isActiveDeposit(entry.payment_status)) return;
    setBusy(true);
    setError('');
    try {
      await api.refundDepositPayment(entry.assignment_id);
      setAdminRevenue((rows) => rows.map((row) => (
        row.assignment_id === entry.assignment_id
          ? { ...row, payment_status: 'refunded', commission_status: 'reversed' }
          : row
      )));
      setNotice(text.refundComplete);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.refundFailed);
    } finally {
      setBusy(false);
    }
  };

  const inspectCompletionProof = async (assignmentId: number) => {
    setBusy(true);
    setError('');
    try {
      const proof = await api.getAdminCompletionProof(assignmentId);
      setAdminProofPreview(`data:${proof.content_type};base64,${proof.data_base64}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load completion proof');
    } finally {
      setBusy(false);
    }
  };

  const decideCancellation = async (
    item: LifecycleAdminItem,
    decision: 'approved' | 'rejected',
    form: HTMLFormElement,
  ) => {
    const formData = new FormData(form);
    const feedback = adminFeedback[item.assignment_id]?.trim() ?? '';
    const materialsCost = Number(formData.get('materials_cost_iqd'));
    const customerShare = Number(formData.get('customer_share_percent'));
    if (decision === 'approved' && (
      !Number.isSafeInteger(materialsCost)
      || materialsCost < 0
      || !Number.isInteger(customerShare)
      || customerShare < 50
      || customerShare > 100
    )) {
      setError(ar
        ? 'أدخل كلفة صحيحة ونسبة حصة بين 50٪ و100٪.'
        : 'Enter a valid cost and a customer share between 50% and 100%.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.reviewProjectCancellation(item.assignment_id, {
        decision,
        ...(decision === 'approved'
          ? { materials_cost_iqd: materialsCost, customer_share_percent: customerShare }
          : {}),
        feedback,
      });
      setAdminLifecycle(await api.listAdminLifecycle());
      setNotice(decision === 'approved'
        ? (ar
          ? `تم اعتماد الإلغاء. الخصم ${result.customer_deduction_iqd?.toLocaleString('ar-IQ') ?? 0} دينار؛ استرداد العربون ${result.deposit_refund_iqd?.toLocaleString('ar-IQ') ?? 0} دينار؛ المبلغ المتبقي ${result.customer_balance_due_iqd?.toLocaleString('ar-IQ') ?? 0} دينار.`
          : `Cancellation approved. Deduction: ${result.customer_deduction_iqd?.toLocaleString('en-US') ?? 0} IQD; deposit refund: ${result.deposit_refund_iqd?.toLocaleString('en-US') ?? 0} IQD; balance due: ${result.customer_balance_due_iqd?.toLocaleString('en-US') ?? 0} IQD.`)
        : (ar ? 'تم رفض طلب الإلغاء ويمكن أن يستمر تنفيذ المشروع.' : 'Cancellation declined; project work may continue.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record cancellation decision');
    } finally {
      setBusy(false);
    }
  };

  const reviewLifecycle = async (item: LifecycleAdminItem, decision: 'approved' | 'changes_requested') => {
    const feedback = adminFeedback[item.assignment_id]?.trim() ?? '';
    if (decision === 'changes_requested' && !feedback) {
      setError(ar ? 'اكتب سبب طلب التعديل قبل الإرسال.' : 'Enter a reason before requesting changes.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await api.reviewProjectLifecycle(item.assignment_id, decision, feedback);
      setAdminLifecycle((rows) => rows.map((row) => row.assignment_id === item.assignment_id ? updated : row));
      if (updated.project && decision === 'approved') {
        setAdminProjects((rows) => [
          updated.project!,
          ...rows.filter((project) => project.id !== updated.project!.id),
        ]);
      }
      setNotice(decision === 'approved'
        ? (ar ? 'تم اعتماد المشروع ونشره.' : 'Project approved and published.')
        : (ar ? 'تم طلب تعديل إثبات الإنجاز.' : 'Changes requested from the company.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not review this project');
    } finally {
      setBusy(false);
    }
  };

  const authorizeWork = async (item: LifecycleAdminItem) => {
    setBusy(true);
    setError('');
    try {
      const updated = await api.authorizeProjectWork(item.assignment_id);
      setAdminLifecycle((rows) => rows.map((row) => (
        row.assignment_id === item.assignment_id ? updated : row
      )));
      setNotice(ar
        ? 'تمت موافقة الأدمن على العقد والمباشرة بالعمل. يمكن للشركة الآن البدء بتنفيذ المشروع.'
        : 'Work authorized. The customer and company will see the authorization alert in their project.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not authorize project work');
    } finally {
      setBusy(false);
    }
  };

  const saveVerificationApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const stage = verificationStage(company?.verification_status);
    if (stage === 0 && !verificationDocuments[identityDocumentType]) {
      setError(text.identityFileRequired);
      return;
    }
    if (stage === 1 && (
      !verificationDocuments.business_register
      || !verificationDocuments.tax
      || !verificationDocuments.project_proof
      || Number(verificationForm.projects) < 3
    )) {
      setError(text.companyFilesRequired);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.updateCompanyVerification(token, {
        projects_count: verificationForm.projects ? Number(verificationForm.projects) : undefined,
      });
      for (const [documentType, file] of Object.entries(verificationDocuments) as [VerificationDocumentType, File][]) {
        await api.uploadVerificationDocument(token, documentType, file);
      }
      setVerificationDocuments({});
      setCompany((current) => current
        ? { ...current, verification_status: verificationStage(current.verification_status) > 0 ? current.verification_status : 'pending' }
        : current);
      setNotice(text.applicationSaved);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const saveProfileContacts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await api.updateCompanyProfileContacts(token, {
        name: companyProfileForm.name.trim(),
        founded_year: Number(companyProfileForm.foundedYear),
        address: companyProfileForm.address.trim() || null,
        phone: primaryPhone.trim() || null,
        support_phone: supportPhone.trim() || null,
      });
      setPrimaryPhone(saved.phone ?? '');
      setSupportPhone(saved.support_phone ?? '');
      setCompany((current) => current ? {
        ...current,
        name: companyProfileForm.name.trim(),
        founded_year: Number(companyProfileForm.foundedYear),
        address: companyProfileForm.address.trim() || null,
        phone: saved.phone,
        support_phone: saved.support_phone,
      } : current);
      setNotice(text.profileSaved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const addCompanyBranch = () => {
    const governorate = newBranchGovernorate.trim();
    const address = newBranchAddress.trim();
    if (!governorate || !address) {
      setError(text.branchRequired);
      return;
    }
    setError('');
    setCompanyBranches((current) => [...current, { governorate, address }]);
    setNewBranchGovernorate('');
    setNewBranchAddress('');
  };

  const saveCompanyBranches = async () => {
    setBranchesBusy(true);
    setError('');
    try {
      const savedBranches = await api.updateCompanyBranches(token, companyBranches);
      setCompanyBranches(savedBranches);
      setCompany((current) => current ? { ...current, branches: savedBranches } : current);
      invalidateCompanies();
      setNotice(text.branchSaved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save company branches');
    } finally {
      setBranchesBusy(false);
    }
  };

  const resubmitVerification = async () => {
    setBusy(true);
    setError('');
    try {
      await api.updateCompanyVerification(token, {
        projects_count: verificationForm.projects ? Number(verificationForm.projects) : undefined,
      });
      const uploadedDocuments: VerificationDocument[] = [];
      for (const [documentType, file] of Object.entries(verificationDocuments) as [VerificationDocumentType, File][]) {
        uploadedDocuments.push(await api.uploadVerificationDocument(token, documentType, file));
      }
      const result = await api.resubmitCompanyVerification(token, {
        projects_count: verificationForm.projects ? Number(verificationForm.projects) : undefined,
      });
      setCompany((current) => current ? {
        ...current,
        verification_status: result.verification_status,
        documents: [
          ...(current.documents ?? []).filter((document) => !uploadedDocuments.some((upload) => upload.document_type === document.document_type)),
          ...uploadedDocuments.map(({ document_type, file_name, content_type, uploaded_at }) => ({
            document_type,
            file_name,
            content_type,
            uploaded_at,
          })),
        ],
      } : current);
      setVerificationDocuments({});
      await refreshProfile();
      setNotice(text.verificationResubmitted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resubmit verification');
    } finally {
      setBusy(false);
    }
  };

  const saveTechnicalDetails = async (
    event: FormEvent<HTMLFormElement>,
    request: CompanyPortalRequest,
  ) => {
    event.preventDefault();
    const changes = technicalEdits[request.group_id] ?? {};
    setBusy(true);
    setError('');
    try {
      const result = await api.updateCompanyRequestTechnicalDetails(token, request.group_id, {
        roof_area: changes.roofArea ?? request.details.roofArea ?? '',
        site_dimensions: changes.siteDimensions ?? request.details.siteDimensions ?? '',
      });
      setRequests((current) => current.map((item) => item.group_id === request.group_id
        ? { ...item, details: { ...item.details, ...result.details } }
        : item));
      setProjectDetailsRequest((current) => current?.group_id === request.group_id
        ? { ...current, details: { ...current.details, ...result.details } }
        : current);
      setNotice(text.technicalDetailsSaved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update technical details');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
    logoutAuth();
  } finally {
    setToken('');
    setCompany(null);
    setRequests([]);
    setMode('portal');
    setError('');
    setNotice('');
    setBusy(false);
  }
  };

  const reviewCompany = async (id: number, decision: 'identity_verified' | 'verified' | 'rejected') => {
    setBusy(true);
    setError('');
    try {
      const checks = reviewChecks[id] ?? {
        identity: false,
        business: false,
        projectProof: false,
        license: false,
        tax: false,
        projects: false,
      };
      const updated = await api.reviewCompany(id, {
        decision,
        identity_document_checked: checks.identity,
        business_document_checked: checks.business,
        project_evidence_checked: checks.projectProof,
        license_checked: checks.license,
        tax_record_checked: checks.tax,
        projects_checked: checks.projects,
      }, authToken);
      setPendingCompanies((items) => items.filter((item) => item.id !== id));
      setAdminCompanies((items) => items.map((item) => item.id === updated.id
        ? { ...item, verification_status: updated.verification_status }
        : item));
      invalidateCompanies();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await refreshProfile();
        openAuthModal();
        setError(text.sessionExpired);
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const visibleRequests = requests.filter((request) => {
    const companyStatus = request.companies[0]?.status ?? 'sent';
    const statusMatches = requestStatusFilter === 'all'
      || (requestStatusFilter === 'open' && (companyStatus === 'sent' || companyStatus === 'viewed'))
      || companyStatus === requestStatusFilter;
    const search = requestSearch.trim().toLocaleLowerCase();
    const location = [request.details.governorate, request.details.district].filter(Boolean).join(' ');
    const searchMatches = !search
      || `${request.group_id} ${request.customer_name} ${location}`.toLocaleLowerCase().includes(search);
    const governorateMatches = !requestGovernorateFilter || request.details.governorate === requestGovernorateFilter;
    const districtMatches = !requestDistrictFilter || request.details.district === requestDistrictFilter;
    return statusMatches
      && searchMatches
      && governorateMatches
      && districtMatches
      && companyRequestSection(request) === companyProjectTab;
  });
  const requestGovernorates = [...new Set(requests.map((request) => request.details.governorate).filter((value): value is string => Boolean(value)))].sort();
  const requestDistricts = [...new Set(requests
    .filter((request) => !requestGovernorateFilter || request.details.governorate === requestGovernorateFilter)
    .map((request) => request.details.district)
    .filter((value): value is string => Boolean(value)))].sort();
  const acceptedRevenue = adminRevenue.filter((entry) => entry.status === 'accepted');
  const acceptedQuoteValue = acceptedRevenue.reduce((total, entry) => total + entry.total_agreed_price_iqd, 0);
  const estimatedCommission = adminRevenue.reduce((total, entry) => total + entry.commission_fee_iqd, 0);

  return (
    <>
      <FlowHeader />
      <main id="main" className="min-h-[70vh] bg-bg-page pb-20">
        <div className="container-page">
          <header className="border-b border-line-subtle py-8">
            <h1 className="text-h2 text-content-primary">{text.title}</h1>
            <p className="mt-2 text-body text-content-secondary">{text.subtitle}</p>
          </header>

          {error && <p role="alert" className="mt-6 rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-4 py-3 text-body-sm text-[var(--status-danger)]">{error}</p>}
          {notice && <p role="status" className="mt-6 rounded-lg border border-[var(--status-success)] bg-[var(--status-success-bg)] px-4 py-3 text-body-sm text-[var(--status-success)]">{notice}</p>}

          {!token || mode === 'reset' ? (
            <section className="mt-8 max-w-2xl">
              {mode === 'admin' ? <>
                <p className="mb-5 rounded-lg border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">{text.adminAccessNotice}</p>
                <form className="flex flex-wrap items-end gap-4" onSubmit={loadAdminQueue}>
                  <Button type="submit" loading={busy}>{text.loadQueue}</Button>
                </form>
                <div role="tablist" aria-label={ar ? 'أقسام لوحة الإدارة' : 'Admin dashboard sections'} className="mt-7 flex flex-wrap gap-2 border-b border-line-subtle">
                  {([
                    ['companies', ar ? 'قطاع الشركات / Companies Sector' : 'Companies Sector / قسم الشركات'],
                    ['clients-projects', ar ? 'قطاع الزبائن والمشاريع / Clients & Projects Sector' : 'Clients & Projects Sector / قسم العملاء والمشاريع'],
                    ['reviews', ar ? 'قطاع التقييمات / Reviews Sector' : 'Reviews Sector / قسم المراجعات'],
                  ] as const).map(([section, label]) => (
                    <button
                      key={section}
                      type="button"
                      role="tab"
                      aria-selected={adminSection === section}
                      onClick={() => setAdminSection(section)}
                      className={`border-b-2 px-4 py-3 text-label-sm ${adminSection === section ? 'border-line-brand text-content-brand' : 'border-transparent text-content-secondary'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {adminSection === 'companies' && <>
                  <div role="tablist" aria-label={ar ? 'إدارة الشركات' : 'Companies sector sections'} className="mt-5 flex flex-wrap gap-2 border-b border-line-subtle">
                    {([
                      ['verification', text.verificationApplications],
                      ['directory', text.companiesManagement],
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={adminCompanyTab === tab}
                        onClick={() => setAdminCompanyTab(tab)}
                        className={`border-b-2 px-4 py-3 text-label-sm ${adminCompanyTab === tab ? 'border-line-brand text-content-brand' : 'border-transparent text-content-secondary'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>}
                {adminSection === 'companies' && adminCompanyTab === 'verification' && <>
                  <div role="tablist" aria-label={ar ? 'طلبات التوثيق' : 'Verification applications'} className="mt-5 flex flex-wrap gap-2 border-b border-line-subtle">
                    {([
                      ['pending', text.pendingApplications],
                      ['approved', text.approvedApplications],
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={verificationTab === tab}
                        onClick={() => setVerificationTab(tab)}
                        className={`border-b-2 px-4 py-3 text-label-sm ${verificationTab === tab ? 'border-line-brand text-content-brand' : 'border-transparent text-content-secondary'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {verificationTab === 'pending' ? <>
                <p className="mt-5 rounded-lg border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">{text.verificationRule}</p>
                {pendingCompanies.length === 0 ? <p className="mt-5 text-body-sm text-content-secondary">{text.noApplications}</p> : <ul className="mt-5 divide-y divide-line-subtle border-y border-line-subtle">
                  {pendingCompanies.map((item) => {
                    const checks = reviewChecks[item.id] ?? {
                      identity: false,
                      business: false,
                      projectProof: false,
                      license: false,
                      tax: false,
                      projects: false,
                    };
                    const documentTypes = item.verification_documents ?? [];
                    const hasLegacyDocuments = Boolean(item.business_license_number?.trim() && item.tax_registration_number?.trim());
                    const canApproveIdentity = checks.identity;
                    const canApproveCompany = (
                      checks.identity
                      && (
                        (checks.business && checks.projectProof)
                        || (
                          hasLegacyDocuments
                          && checks.license
                          && checks.tax
                          && checks.projects
                        )
                      )
                    );
                    const setCheck = (
                      key: 'identity' | 'business' | 'projectProof' | 'license' | 'tax' | 'projects',
                      value: boolean,
                    ) => setReviewChecks((current) => ({
                      ...current,
                      [item.id]: {
                        ...(current[item.id] ?? {
                          identity: false,
                          business: false,
                          projectProof: false,
                          license: false,
                          tax: false,
                          projects: false,
                        }),
                        [key]: value,
                      },
                    }));
                    return <li key={item.id} className="py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h2 className="text-label text-content-primary">{item.name}</h2>
                          <p className="mt-1 text-body-sm text-content-secondary">{item.email} · {item.phone} · {item.address}</p>
                          <p className="mt-2 text-body-sm text-content-secondary">{text.completedProjectsCount}: {item.completed_project_count}</p>
                          <p className="mt-1 text-body-xs text-content-tertiary">{item.verification_status === 'identity_verified' ? text.identityApproved : text.unverifiedCompany}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="md" loading={busy} disabled={!canApproveCompany} onClick={() => reviewCompany(item.id, 'verified')}>{text.approveCompany}</Button>
                          <Button size="md" variant="secondary" loading={busy} onClick={() => reviewCompany(item.id, 'rejected')}>{text.rejectedApplication}</Button>
                        </div>
                      </div>
                      <div className="mt-4 rounded-md border border-line-subtle bg-bg-subtle p-4">
                        <h3 className="text-label text-content-primary">{ar ? 'وثيقة التوثيق والإثبات' : 'Verification Document Review'}</h3>
                        {documentTypes.length === 0 ? (
                          <p className="mt-2 text-body-sm text-content-secondary">{text.noDocuments}</p>
                        ) : (
                          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                            {documentTypes.map((documentType) => (
                              <li key={documentType} className="flex items-center justify-between gap-3 text-body-sm">
                                <span className="text-content-primary">{DOCUMENT_LABELS[documentType]?.[ar ? 'ar' : 'en'] ?? documentType}</span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void openVerificationDocument(item.id, documentType)}
                                  className="shrink-0 text-label-sm text-content-brand underline disabled:opacity-60"
                                >
                                  {text.viewDocument}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="mt-4 flex flex-col gap-2.5 text-body-sm text-content-secondary">
                        <label className="flex items-start gap-2"><input type="checkbox" checked={checks.identity} onChange={(event) => setCheck('identity', event.target.checked)} />{text.identityDocumentChecked}</label>
                        <label className="flex items-start gap-2"><input type="checkbox" checked={checks.business} onChange={(event) => setCheck('business', event.target.checked)} />{ar ? 'تمت مراجعة السجل التجاري الرسمي' : 'Official business register reviewed'}</label>
                        <label className="flex items-start gap-2"><input type="checkbox" checked={checks.projectProof} onChange={(event) => setCheck('projectProof', event.target.checked)} />{ar ? 'تمت مراجعة إثبات المشاريع المنجزة' : 'Completed-project evidence reviewed'}</label>
                        {hasLegacyDocuments && (
                          <>
                            <label className="flex items-start gap-2"><input type="checkbox" checked={checks.license} onChange={(event) => setCheck('license', event.target.checked)} />{text.checkLicense}</label>
                            <label className="flex items-start gap-2"><input type="checkbox" checked={checks.tax} onChange={(event) => setCheck('tax', event.target.checked)} />{text.checkTax}</label>
                            <label className="flex items-start gap-2"><input type="checkbox" checked={checks.projects} onChange={(event) => setCheck('projects', event.target.checked)} />{text.checkProjects}</label>
                          </>
                        )}
                      </div>
                      <p className="mt-3 rounded-md bg-bg-subtle px-3 py-2 text-body-sm text-content-secondary">
                        {!canApproveIdentity && !canApproveCompany
                          ? `${text.identityReviewRequired} ${text.companyReviewRequired}`
                          : !canApproveIdentity ? text.identityReviewRequired : !canApproveCompany ? text.companyReviewRequired : ''}
                      </p>
                    </li>;
                  })}
                </ul>}
                  </> : (
                    <section role="tabpanel" className="mt-5">
                      <h2 className="text-h3 text-content-primary">{text.approvedApplications}</h2>
                      {adminCompanies.filter((item) => item.verification_status === 'identity_verified' || item.verification_status === 'verified').length === 0
                        ? <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{text.noApplications}</p>
                        : <ul className="mt-4 divide-y divide-line-subtle border-y border-line-subtle">
                          {adminCompanies.filter((item) => item.verification_status === 'identity_verified' || item.verification_status === 'verified').map((item) => (
                            <li key={item.id} className="py-4">
                              <h3 className="text-label text-content-primary">{item.name}</h3>
                              <p className="mt-1 text-body-sm text-content-secondary">{item.email} · {item.phone} · {item.address}</p>
                              <p className="mt-1 text-body-xs text-content-tertiary">{item.verification_status === 'verified' ? text.verificationComplete : text.identityApproved}</p>
                            </li>
                          ))}
                        </ul>}
                    </section>
                  )}
                </>}
                {adminSection === 'clients-projects' && <>
                  <div role="tablist" aria-label={ar ? 'إدارة الزبائن والمشاريع' : 'Clients and projects sections'} className="mt-5 flex flex-wrap gap-2 border-b border-line-subtle">
                    {([
                      ['clients', text.clientsManagement],
                      ['projects', text.projectsManagement],
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={adminClientsProjectsTab === tab}
                        onClick={() => setAdminClientsProjectsTab(tab)}
                        className={`border-b-2 px-4 py-3 text-label-sm ${adminClientsProjectsTab === tab ? 'border-line-brand text-content-brand' : 'border-transparent text-content-secondary'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>}
                {adminSection === 'clients-projects' && adminClientsProjectsTab === 'projects' && <>
                <section className="mt-10">
                  <h2 className="text-h3 text-content-primary">{text.portfolio}</h2>
                  <div role="tablist" aria-label={ar ? 'مراحل المشاريع' : 'Project lifecycle views'} className="mt-4 flex flex-wrap gap-2 border-b border-line-subtle">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={adminProjectTab === 'active'}
                      onClick={() => setAdminProjectTab('active')}
                      className={`border-b-2 px-4 py-3 text-label-sm ${adminProjectTab === 'active' ? 'border-line-brand text-content-brand' : 'border-transparent text-content-secondary'}`}
                    >
                      {ar ? 'المشاريع النشطة وبانتظار الموافقة' : 'Active & Pending Approval Projects'}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={adminProjectTab === 'verified'}
                      onClick={() => setAdminProjectTab('verified')}
                      className={`border-b-2 px-4 py-3 text-label-sm ${adminProjectTab === 'verified' ? 'border-line-brand text-content-brand' : 'border-transparent text-content-secondary'}`}
                    >
                      {ar ? 'المشاريع المثبتة والمكتملة' : 'Verified & Completed Projects Portfolio'}
                    </button>
                  </div>
                  {adminProjectTab === 'active' ? (
                    <section role="tabpanel" className="mt-5">
                      <h3 className="text-h4 text-content-primary">{ar ? 'المشاريع النشطة والطلبات الحالية' : 'Active & Pending Approval Projects'}</h3>
                      {adminLifecycle.some((item) => item.stage === 'pending_work_approval') && (
                        <h4 className="mt-5 border-s-4 border-amber-500 bg-amber-50 px-4 py-3 text-label text-slate-900">
                          {ar ? 'المشاريع بانتظار إذن المباشرة' : 'Pending Project Approvals'}
                        </h4>
                      )}
                      {adminLifecycle.filter((item) => item.stage !== 'approved').length === 0 ? (
                        <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{ar ? 'لا توجد مشاريع أو طلبات بانتظار المراجعة.' : 'No active requests or projects are awaiting review.'}</p>
                      ) : (
                        <ul className="mt-4 flex flex-col gap-4">
                          {adminLifecycle.filter((item) => item.stage !== 'approved').map((item) => {
                            const stageLabel = item.stage === 'rfq_submitted'
                              ? (ar ? 'طلب مقدم' : 'RFQ Submitted by Customer')
                              : item.stage === 'quotes_received'
                                ? (ar ? 'تم استلام عروض الأسعار' : 'Quotes Received')
                                : item.stage === 'contract_signatures_pending'
                                  ? (ar ? 'بانتظار توقيع الزبون والشركة' : 'Awaiting Customer & Company Signatures')
                                : item.stage === 'completion_pending_review'
                                  ? (ar ? 'تم رفع الإنجاز بانتظار المراجعة' : 'Completion Claimed - Pending Review')
                                    : item.stage === 'cancellation_pending_review'
                                      ? (ar ? 'طلب إلغاء بانتظار مراجعة الكلفة' : 'Cancellation Pending Cost Review')
                                      : item.stage === 'pending_work_approval'
                                      ? (ar ? 'العقد بانتظار إذن المباشرة' : 'Signed Contract - Pending Work Authorization')
                                    : item.stage === 'changes_requested'
                                      ? (ar ? 'مطلوب تعديل الإثبات' : 'Changes Requested')
                                      : (ar ? 'عقد مبرم وقيد التنفيذ' : 'Contract Executed & In Progress');
                            return (
                              <li key={item.assignment_id} className="rounded-lg border border-line-subtle bg-bg-surface p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h4 className="text-label text-content-primary">{item.request_id} · {item.company_name}</h4>
                                    <p className="mt-1 text-body-sm text-content-secondary">{item.customer_name}</p>
                                  </div>
                                  <span className="rounded-full border border-line-brand bg-[var(--brand-subtle)] px-3 py-1 text-label-sm text-content-brand">{stageLabel}</span>
                                </div>
                                {item.contract && <ContractDocumentCard contract={item.contract} />}
                                {item.quote && <p className="mt-3 text-body-sm text-content-secondary">{ar ? 'السعر المتفق عليه/المقدم' : 'Quote total'}: {item.quote.total_iqd.toLocaleString('en-US')} IQD</p>}
                                {item.admin_feedback && <p role="status" className="mt-3 rounded-md bg-[var(--status-warning-bg)] px-3 py-2 text-body-sm text-content-secondary">{item.admin_feedback}</p>}
                                {item.has_completion_proof && (
                                  <button type="button" disabled={busy} onClick={() => void inspectCompletionProof(item.assignment_id)} className="mt-3 text-label-sm text-content-brand underline disabled:opacity-60">
                                    {ar ? 'معاينة صورة الإنجاز' : 'View Uploaded Completion Photo'}
                                  </button>
                                )}
                                {item.stage === 'pending_work_approval' && (
                                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
                                    <p className="text-body-sm text-slate-800">
                                      {ar
                                        ? `توقيع الزبون: ${item.customer_contract_signed ? 'مكتمل' : 'بانتظار التوقيع'} · توقيع الشركة: ${item.company_contract_signed ? 'مكتمل' : 'بانتظار التوقيع'}`
                                        : `Customer signature: ${item.customer_contract_signed ? 'Signed' : 'Pending'} · Company signature: ${item.company_contract_signed ? 'Signed' : 'Pending'}`}
                                    </p>
                                    <Button size="md" loading={busy} onClick={() => void authorizeWork(item)} className="mt-3">
                                      {ar ? 'موافقة والمباشرة بالعمل' : 'Approve & Start Project'}
                                    </Button>
                                  </div>
                                )}
                                {item.stage === 'completion_pending_review' && (
                                  <div className="mt-4 grid gap-3 border-t border-line-subtle pt-4">
                                    <Textarea
                                      label={ar ? 'سبب الرفض أو التعديلات المطلوبة' : 'Rejection / requested changes'}
                                      rows={2}
                                      maxLength={2000}
                                      value={adminFeedback[item.assignment_id] ?? ''}
                                      onChange={(event) => setAdminFeedback((current) => ({ ...current, [item.assignment_id]: event.target.value }))}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <Button size="md" loading={busy} onClick={() => void reviewLifecycle(item, 'approved')}>{ar ? 'توثيق وإكمال المشروع' : 'Verify & Mark as Completed'}</Button>
                                      <Button size="md" variant="secondary" loading={busy} onClick={() => void reviewLifecycle(item, 'changes_requested')}>{ar ? 'رفض / طلب تعديل' : 'Reject / Request Changes'}</Button>
                                    </div>
                                  </div>
                                )}
                                {item.stage === 'cancellation_pending_review' && (
                                  <form className="mt-4 grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                                    <p className="text-body-sm text-slate-800">
                                      {ar
                                        ? 'راجع المستندات وحدد كلفة المعدات والمواد المثبتة، ثم اختر نسبة تحميل العميل بين 50٪ و100٪.'
                                        : 'Review the supporting records, enter incurred equipment/material costs, then set the customer share between 50% and 100%.'}
                                    </p>
                                    <label className="grid gap-1 text-label-sm text-slate-800">
                                      {ar ? 'كلفة المعدات والمواد (دينار عراقي)' : 'Equipment/material cost (IQD)'}
                                      <input
                                        name="materials_cost_iqd"
                                        type="number"
                                        min="0"
                                        step="1"
                                        required
                                        className="rounded-md border border-slate-300 bg-white px-3 py-2"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-label-sm text-slate-800">
                                      {ar ? 'حصة العميل (%)' : 'Customer share (%)'}
                                      <input
                                        name="customer_share_percent"
                                        type="number"
                                        min="50"
                                        max="100"
                                        step="1"
                                        defaultValue="50"
                                        required
                                        className="rounded-md border border-slate-300 bg-white px-3 py-2"
                                      />
                                    </label>
                                    <Textarea
                                      label={ar ? 'ملاحظات المراجعة' : 'Review notes'}
                                      rows={2}
                                      maxLength={2000}
                                      value={adminFeedback[item.assignment_id] ?? ''}
                                      onChange={(event) => setAdminFeedback((current) => ({ ...current, [item.assignment_id]: event.target.value }))}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        size="md"
                                        loading={busy}
                                        onClick={(event) => {
                                          const form = event.currentTarget.closest('form');
                                          if (form) void decideCancellation(item, 'approved', form);
                                        }}
                                      >
                                        {ar ? 'اعتماد الإلغاء وتحديد الخصم' : 'Approve Cancellation & Set Deduction'}
                                      </Button>
                                      <Button
                                        size="md"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={(event) => {
                                          const form = event.currentTarget.closest('form');
                                          if (form) void decideCancellation(item, 'rejected', form);
                                        }}
                                      >
                                        {ar ? 'رفض الإلغاء' : 'Reject Cancellation'}
                                      </Button>
                                    </div>
                                  </form>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ) : (
                    <section role="tabpanel" className="mt-5">
                      <h3 className="text-h4 text-content-primary">{ar ? 'المشاريع المكتملة والمثبتة' : 'Verified & Completed Projects Portfolio'}</h3>
                      {adminLifecycle.filter((item) => item.stage === 'approved').map((item) => (
                        <article key={item.assignment_id} className="mt-4 rounded-lg border border-line-subtle bg-bg-surface p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="text-label text-content-primary">{item.project?.title ?? item.request_id}</h4>
                              <p className="mt-1 text-body-sm text-content-secondary">{item.company_name} · {item.customer_name}</p>
                              <span className="mt-2 inline-flex rounded-full border border-[var(--status-success)] bg-[var(--status-success-bg)] px-3 py-1 text-label-sm text-[var(--status-success)]">{ar ? 'معتمد ومكتمل' : 'Approved & Completed'}</span>
                            </div>
                          </div>
                          {item.contract && <ContractDocumentCard contract={item.contract} />}
                          {item.has_completion_proof && <button type="button" disabled={busy} onClick={() => void inspectCompletionProof(item.assignment_id)} className="mt-3 text-label-sm text-content-brand underline">{ar ? 'معاينة صورة الإنجاز' : 'View Completion Photo'}</button>}
                          {item.customer_review && <blockquote className="mt-3 rounded-md bg-bg-subtle p-3 text-body-sm text-content-secondary">{item.customer_review.comment}</blockquote>}
                          <ol className="mt-3 list-decimal ps-5 text-body-xs text-content-tertiary">
                            {item.audit.map((event, index) => <li key={`${event.event}-${index}`}>{event.event} · {new Date(event.at).toLocaleString(ar ? 'ar-IQ' : 'en-GB')}</li>)}
                          </ol>
                        </article>
                      ))}
                      {adminProjects.filter((project) =>
                        project.status === 'completed'
                        && !adminLifecycle.some((item) => item.project?.id === project.id),
                      ).map((project) => (
                        <article key={project.id} className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line-subtle bg-bg-surface p-4">
                          <div>
                            <h4 className="text-label text-content-primary">{project.title}</h4>
                            <p className="mt-1 text-body-sm text-content-secondary">{project.company.name} · {project.location_governorate}, {project.location_district}</p>
                          </div>
                        </article>
                      ))}
                      {adminLifecycle.every((item) => item.stage !== 'approved')
                        && !adminProjects.some((project) => project.status === 'completed')
                        && <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{text.noPortfolioProjects}</p>}
                    </section>
                  )}
                </section>
                <section className="mt-10">
                  <h2 className="text-h3 text-content-primary">{text.revenueTitle}</h2>
                  {adminRevenue.length === 0 ? (
                    <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{text.noRevenue}</p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <dl className="mb-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-line-subtle bg-bg-subtle p-4">
                          <dt className="text-body-xs text-content-secondary">{text.acceptedQuoteCount}</dt>
                          <dd className="mt-1 text-h4 text-content-primary">{acceptedRevenue.length}</dd>
                        </div>
                        <div className="rounded-lg border border-line-subtle bg-bg-subtle p-4">
                          <dt className="text-body-xs text-content-secondary">{text.acceptedQuoteValue}</dt>
                          <dd className="numeric mt-1 text-h4 text-content-primary">{acceptedQuoteValue.toLocaleString('en-US')} IQD</dd>
                        </div>
                        <div className="rounded-lg border border-line-subtle bg-bg-subtle p-4">
                          <dt className="text-body-xs text-content-secondary">{text.commissionTotal}</dt>
                          <dd className="numeric mt-1 text-h4 text-content-primary">{estimatedCommission.toLocaleString('en-US')} IQD</dd>
                        </div>
                      </dl>
                      <p className="mb-3 text-label-sm text-content-tertiary">{text.simulatedPaymentNote}</p>
                      <table className="w-full min-w-[62rem] border-y border-line-subtle text-start text-body-sm">
                        <thead>
                          <tr className="border-b border-line-subtle text-content-secondary">
                            <th scope="col" className="py-3 pe-4 font-medium">{text.name}</th>
                            <th scope="col" className="py-3 pe-4 font-medium">{text.projectTitle}</th>
                            <th scope="col" className="py-3 pe-4 font-medium">{text.agreedPrice}</th>
                            <th scope="col" className="py-3 pe-4 font-medium">{text.commissionFee}</th>
                            <th scope="col" className="py-3 pe-4 font-medium">{text.paymentTracking}</th>
                            <th scope="col" className="py-3 pe-4 font-medium">{text.transactionId}</th>
                            <th scope="col" className="py-3 font-medium">{text.revenueStatus}</th>
                            <th scope="col" className="py-3 font-medium">{text.refundDeposit}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminRevenue.map((entry) => (
                            <tr key={entry.project_id > 0 ? `project-${entry.project_id}` : `quote-${entry.assignment_id}`} className="border-b border-line-subtle last:border-0">
                              <td className="py-3 pe-4 text-content-primary">{entry.company_name}</td>
                              <td className="py-3 pe-4 text-content-primary">{entry.project_title}</td>
                              <td className="numeric py-3 pe-4 text-content-primary">
                                {entry.total_agreed_price_iqd.toLocaleString('en-US')} IQD
                              </td>
                              <td className="numeric py-3 pe-4 text-content-primary">{entry.commission_fee_iqd.toLocaleString('en-US')} IQD</td>
                              <td className="numeric py-3 pe-4 text-content-primary">
                                {entry.deposit_iqd != null ? `${entry.deposit_iqd.toLocaleString('en-US')} IQD` : '—'}
                              </td>
                              <td className="py-3 pe-4 text-content-secondary">{entry.transaction_id ?? '—'}</td>
                              <td className="py-3 pe-4 text-content-secondary">
                                {isActiveDeposit(entry.payment_status)
                                  ? text.commissionCollected
                                  : entry.payment_status === 'refunded'
                                    ? text.refundedStatus
                                    : text.commissionPending}
                              </td>
                              <td className="py-3">
                                {isActiveDeposit(entry.payment_status) && entry.assignment_id != null ? (
                                  <Button variant="secondary" size="md" disabled={busy} onClick={() => { void refundAdminDeposit(entry); }}>
                                    {text.refundDeposit}
                                  </Button>
                                ) : entry.payment_status === 'refunded' ? text.refundedStatus : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <section className="mt-10">
                  <h2 className="text-h3 text-content-primary">{text.reportsTitle}</h2>
                  {policyReports.length === 0 ? (
                    <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{text.noReports}</p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[42rem] border-y border-line-subtle text-start text-body-sm">
                        <thead>
                          <tr className="border-b border-line-subtle text-content-secondary">
                            <th scope="col" className="py-3 pe-4 font-medium">{ar ? 'البلاغ' : 'Report'}</th>
                            <th scope="col" className="py-3 pe-4 font-medium">{ar ? 'التفاصيل' : 'Details'}</th>
                            <th scope="col" className="py-3 pe-4 font-medium">{text.revenueStatus}</th>
                            <th scope="col" className="py-3 font-medium">{ar ? 'الإجراء' : 'Actions'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {policyReports.map((report) => (
                            <tr key={report.id} className="border-b border-line-subtle last:border-0">
                              <td className="py-3 pe-4 align-top text-content-primary">
                                {report.subject}
                              </td>
                              <td className="max-w-sm whitespace-pre-wrap py-3 pe-4 align-top text-content-secondary">{report.description}</td>
                              <td className="py-3 pe-4 align-top">
                                <span className="rounded-full border border-line-subtle bg-bg-subtle px-2.5 py-1 text-body-xs text-content-secondary">
                                  {report.status === 'pending' ? text.reportPending : report.status === 'resolved' ? text.reportResolved : text.reportDismissed}
                                </span>
                              </td>
                              <td className="py-3 align-top">
                                {report.status === 'pending' && (
                                  <div className="flex flex-wrap gap-2">
                                    <Button size="md" loading={busy} onClick={() => void updateReportStatus(report.id, 'resolved')}>{text.resolveReport}</Button>
                                    <Button size="md" variant="secondary" loading={busy} onClick={() => void updateReportStatus(report.id, 'dismissed')}>{text.dismissReport}</Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                </>}
                {adminSection === 'companies' && adminCompanyTab === 'directory' && <section className="mt-5">
                  <h2 className="text-h3 text-content-primary">{text.companiesManagement}</h2>
                  {adminCompanies.length === 0
                    ? <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{text.noCompanies}</p>
                    : <ul className="mt-4 divide-y divide-line-subtle border-y border-line-subtle">
                      {adminCompanies.map((company) => {
                        const companyProjects = adminProjects.filter((project) => project.company_id === company.id);
                        const statusLabel = company.verification_status === 'verified' || company.verification_status === 'identity_verified'
                          ? text.verificationComplete
                          : company.verification_status === 'rejected' ? text.rejectedStatus : text.unverifiedCompany;
                        return (
                          <li key={company.id} className="py-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <h3 className="text-label text-content-primary">{company.name}</h3>
                                <p className="mt-1 text-body-sm text-content-secondary">{company.email || '—'} · {company.phone || '—'} · {company.support_phone || '—'}</p>
                                <p className="mt-1 text-body-sm text-content-secondary">{company.address || '—'} · {company.founded_year || '—'}</p>
                                <p className="mt-1 text-body-xs text-content-tertiary">{text.companyStatus}: {statusLabel} · {company.is_blocked ? text.companyBlocked : text.companyActive}</p>
                                <p className="mt-1 text-body-xs text-content-tertiary">{text.license}: {company.business_license_number || '—'} · {text.tax}: {company.tax_registration_number || '—'}</p>
                              </div>
                              <Button
                                variant={company.is_blocked ? 'primary' : 'secondary'}
                                size="md"
                                loading={busy}
                                onClick={() => void setCompanyBlocked(company)}
                              >
                                {company.is_blocked ? text.unblockCompany : text.blockCompany}
                              </Button>
                            </div>
                            {(company.verification_documents?.length ?? 0) > 0 && (
                              <div className="mt-3 flex flex-wrap gap-3">
                                {company.verification_documents?.map((documentType) => (
                                  <button
                                    key={documentType}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void openVerificationDocument(company.id, documentType)}
                                    className="text-label-sm text-content-brand underline disabled:opacity-60"
                                  >
                                    {DOCUMENT_LABELS[documentType]?.[ar ? 'ar' : 'en'] ?? documentType}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="mt-4">
                              <h4 className="text-label-sm text-content-primary">{text.companyProjects}</h4>
                              {companyProjects.length === 0
                                ? <p className="mt-1 text-body-xs text-content-tertiary">{text.noPortfolioProjects}</p>
                                : <ul className="mt-2 flex flex-wrap gap-2">
                                  {companyProjects.map((project) => (
                                    <li key={project.id} className="rounded-md border border-line-subtle bg-bg-subtle px-3 py-2 text-body-xs text-content-secondary">
                                      {project.title} · {project.status}
                                    </li>
                                  ))}
                                </ul>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>}
                </section>}
                {adminSection === 'clients-projects' && adminClientsProjectsTab === 'clients' && <section className="mt-5">
                  <h2 className="text-h3 text-content-primary">{text.clientsManagement}</h2>
                  {adminClients.length === 0
                    ? <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{text.noClients}</p>
                    : <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[48rem] border-y border-line-subtle text-start text-body-sm">
                        <thead><tr className="border-b border-line-subtle text-content-secondary">
                          <th scope="col" className="py-3 pe-4 font-medium">{text.customer}</th>
                          <th scope="col" className="py-3 pe-4 font-medium">{text.email}</th>
                          <th scope="col" className="py-3 pe-4 font-medium">{text.phone}</th>
                          <th scope="col" className="py-3 pe-4 font-medium">{text.registered}</th>
                          <th scope="col" className="py-3 pe-4 font-medium">{text.revenueStatus}</th>
                          <th scope="col" className="py-3 font-medium">{ar ? 'الإجراء' : 'Action'}</th>
                        </tr></thead>
                        <tbody>{adminClients.map((client) => (
                          <tr key={client.id} className="border-b border-line-subtle last:border-0">
                            <td className="py-3 pe-4 text-content-primary">{client.full_name}</td>
                            <td className="py-3 pe-4 text-content-secondary">{client.email}</td>
                            <td className="py-3 pe-4 text-content-secondary">{client.phone || '—'}</td>
                            <td className="py-3 pe-4 text-content-secondary">{new Date(client.created_at).toLocaleDateString(ar ? 'ar-IQ' : 'en-GB')}</td>
                            <td className="py-3 pe-4 text-content-secondary">{client.is_active ? text.clientActive : text.clientBlocked}</td>
                            <td className="py-3">
                              <Button
                                variant={client.is_active ? 'secondary' : 'primary'}
                                size="md"
                                loading={busy}
                                onClick={() => void setClientBlocked(client)}
                              >
                                {client.is_active ? text.blockClient : text.unblockClient}
                              </Button>
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>}
                </section>}
                {adminSection === 'reviews' && <section className="mt-5">
                  <h2 className="text-h3 text-content-primary">{text.reviewsManagement}</h2>
                  {adminReviews.length === 0
                    ? <p className="mt-4 border-y border-line-subtle py-5 text-body-sm text-content-secondary">{text.noReviews}</p>
                    : <ul className="mt-4 divide-y divide-line-subtle border-y border-line-subtle">
                      {adminReviews.map((review) => (
                        <li key={review.id} className="py-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-label text-content-primary">{review.company_name} · {review.rating}/5</h3>
                              <p className="mt-1 text-body-sm text-content-secondary">{review.client_name} · {review.project_title} · {new Date(review.created_at).toLocaleDateString(ar ? 'ar-IQ' : 'en-GB')}</p>
                              <p className="mt-2 whitespace-pre-wrap text-body-sm text-content-secondary">{review.comment}</p>
                              <p className="mt-1 text-body-xs text-content-tertiary">{review.is_hidden ? text.reviewHidden : text.reviewVisible}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                size="md"
                                loading={busy}
                                onClick={() => void setReviewHidden(review)}
                              >
                                {review.is_hidden ? text.showReview : text.hideReview}
                              </Button>
                              <Button
                                variant="secondary"
                                size="md"
                                loading={busy}
                                onClick={() => void deleteAdminReview(review.id)}
                              >
                                {text.deleteReview}
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>}
                </section>}
              </> : mode === 'forgot' || mode === 'reset' ? <>
                <h2 className="mb-5 text-h3 text-content-primary">{text.recoveryTitle}</h2>
                {!resetToken && mode === 'reset' && (
                  <p role="alert" className="mb-4 text-body-sm text-[var(--status-danger)]">{text.invalidResetLink}</p>
                )}
                <form className="grid gap-5" onSubmit={handleAuth}>
                  {mode === 'forgot' ? (
                    <Input label={text.email} name="email" type="email" autoComplete="email" required />
                  ) : <>
                    <CompanyPasswordInput label={text.newPassword} name="new_password" autoComplete="new-password" minLength={10} />
                    <CompanyPasswordInput label={text.confirmPassword} name="confirm_password" autoComplete="new-password" minLength={10} />
                  </>}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" loading={busy} disabled={mode === 'reset' && !resetToken}>
                      {mode === 'forgot' ? text.sendResetLink : text.resetPassword}
                    </Button>
                    <button type="button" className="text-label-sm text-content-brand underline" onClick={() => { setMode('portal'); setError(''); setNotice(''); }}>
                      {text.backToSignIn}
                    </button>
                  </div>
                </form>
              </> : user?.role === 'client' ? <>
                <p role="status" className="rounded-lg border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">{text.signedInAsClient}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button onClick={() => { window.location.hash = '#/requests'; }}>{text.goToMyRequests}</Button>
                  <Button variant="secondary" onClick={() => logoutAuth()}>{text.switchAccount}</Button>
                </div>
              </> : user?.role === 'company' || authLoading ? null : (
                <CompanyAuthForm onForgotPassword={() => { setMode('forgot'); setError(''); setNotice(''); }} />
              )}
            </section>
          ) : (
            <section className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-subtle pb-5">
                <div>
                  <h2 className="text-h3 text-content-primary">{text.companyProfileSettings}</h2>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-label-sm ${
                    verificationStage(company?.verification_status) === 2
                      ? 'border-[var(--status-success)] bg-[var(--status-success-bg)] text-[var(--status-success)]'
                      : 'border-line-subtle bg-bg-subtle text-content-secondary'
                  }`}>
                    {text.verificationStatus}: {company?.verification_status === 'rejected'
                      ? text.verificationRejected
                      : verificationStage(company?.verification_status) === 2
                        ? text.verificationComplete
                        : verificationStage(company?.verification_status) === 1
                          ? text.identityApproved
                          : company?.verification_status === 'pending'
                            ? (ar ? 'قيد المراجعة' : 'Pending review')
                            : text.unverifiedCompany}
                  </span>
                </div>
                <Button variant="secondary" loading={busy} onClick={() => { void logout(); }}>{text.logout}</Button>
              </div>

              <form className="mt-6 grid gap-4 rounded-lg border border-line-subtle bg-bg-subtle p-4 sm:grid-cols-2" onSubmit={saveProfileContacts}>
                <Input
                  label={text.name}
                  name="company_name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={companyProfileForm.name}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, name: event.target.value }))}
                />
                <Input
                  label={text.foundedYear}
                  name="founded_year"
                  type="number"
                  min="1900"
                  max="2100"
                  required
                  value={companyProfileForm.foundedYear}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, foundedYear: event.target.value }))}
                />
                <Input
                  label={text.headquarters}
                  name="address"
                  maxLength={500}
                  value={companyProfileForm.address}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, address: event.target.value }))}
                />
                <div>
                  <Input
                    label={text.phone}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    maxLength={11}
                    pattern="07[0-9]{9}"
                    placeholder="07XXXXXXXXX"
                    title={ar ? '11 رقم يبدأ بـ 07' : '11 digits starting with 07'}
                    value={primaryPhone}
                    onChange={(event) => setPrimaryPhone(event.target.value)}
                  />
                </div>
                <div>
                  <Input
                    label={text.supportPhoneOptional}
                    name="support_phone"
                    type="tel"
                    inputMode="tel"
                    maxLength={11}
                    pattern={SUPPORT_PHONE_PATTERN}
                    placeholder="e.g., 07XXXXXXXXX or 6060"
                    title={ar ? 'موبايل عراقي أو رقم دعم من 3 إلى 6 أرقام أو خط أرضي' : 'Iraqi mobile, 3–6 digit support code, or landline'}
                    value={supportPhone}
                    onChange={(event) => setSupportPhone(event.target.value)}
                  />
                  <p className="mt-1 text-body-xs text-content-tertiary">{text.supportPhoneHelpOptional}</p>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" loading={busy}>{text.saveCompanyProfile}</Button>
                </div>
              </form>

              <section aria-labelledby="company-branches-heading" className="mt-5 rounded-lg border border-line-subtle bg-bg-subtle p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="company-branches-heading" className="text-label text-content-primary">{text.additionalBranches}</h3>
                    <p className="mt-1 text-body-xs text-content-secondary">{text.branchGovernorate} · {text.branchAddress}</p>
                  </div>
                  <Button type="button" variant="secondary" loading={branchesBusy} onClick={() => { void saveCompanyBranches(); }}>
                    {text.saveBranches}
                  </Button>
                </div>
                {companyBranches.length > 0 && (
                  <ul className="mt-4 grid gap-2">
                    {companyBranches.map((branch, index) => (
                      <li key={`${branch.governorate}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-3 py-2.5">
                        <span className="text-body-sm text-content-primary">{branch.governorate} · {branch.address}</span>
                        <button
                          type="button"
                          onClick={() => setCompanyBranches((current) => current.filter((_, branchIndex) => branchIndex !== index))}
                          className="text-label-sm text-[var(--status-danger)] underline decoration-[var(--status-danger)]/40 underline-offset-2"
                        >
                          {text.removeBranch}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                  <Input
                    label={text.branchGovernorate}
                    name="branch_governorate"
                    value={newBranchGovernorate}
                    onChange={(event) => setNewBranchGovernorate(event.target.value)}
                  />
                  <Input
                    label={text.branchAddress}
                    name="branch_address"
                    value={newBranchAddress}
                    onChange={(event) => setNewBranchAddress(event.target.value)}
                  />
                  <Button type="button" variant="secondary" onClick={addCompanyBranch}>{text.addBranch}</Button>
                </div>
              </section>

              <section className="mt-5" data-notification-verification>
                {verificationStage(company?.verification_status) === 2 ? (
                  <p role="status" className="rounded-lg border border-[var(--status-success)] bg-[var(--status-success-bg)] px-4 py-3 text-body-sm text-[var(--status-success)]">
                    {text.verificationCompletePrompt}
                  </p>
                ) : company?.verification_status === 'pending' ? (
                  <p role="status" className="rounded-lg border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">
                    {text.verificationPendingPrompt}
                  </p>
                ) : (
                  <>
                    <div className="rounded-lg border border-line-subtle bg-bg-subtle p-4">
                      <h3 className="text-label text-content-primary">{text.uploadedDocuments}</h3>
                      {(company?.documents?.length ?? 0) === 0 ? (
                        <p className="mt-2 text-body-sm text-content-secondary">{text.noUploadedDocuments}</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {company?.documents?.map((document) => (
                            <li key={document.document_type} className="rounded-md border border-line-subtle bg-bg-surface px-3 py-2 text-body-xs text-content-secondary">
                              {DOCUMENT_LABELS[document.document_type][ar ? 'ar' : 'en']}: {document.file_name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="mt-5 rounded-lg border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">
                      {company?.verification_status === 'rejected'
                        ? text.verificationRejectedPrompt
                        : verificationStage(company?.verification_status) === 0 ? text.unverifiedPrompt : text.identityApprovedPrompt}
                    </p>
                    <form className="mt-5 grid gap-4 border-y border-line-subtle py-5 sm:grid-cols-2" onSubmit={saveVerificationApplication}>
                      <p className="text-body-sm text-content-secondary sm:col-span-2">{text.verificationRule}</p>
                      <label className="grid gap-1.5 text-label-sm text-content-secondary">
                        <span>{text.identityDocument}</span>
                        <select
                          aria-label={text.identityDocument}
                          value={identityDocumentType}
                          onChange={(event) => setIdentityDocumentType(event.target.value as typeof identityDocumentType)}
                          className="platform-select"
                        >
                          {IDENTITY_DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{DOCUMENT_LABELS[type][ar ? 'ar' : 'en']}</option>)}
                        </select>
                        <input aria-label={`${text.identityDocument} ${text.uploadDocument}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setVerificationDocuments((current) => ({ ...current, [identityDocumentType]: event.target.files?.[0] }))} className="min-h-11 rounded-md border border-line bg-bg-surface px-3 py-2 text-body-sm text-content-primary" />
                      </label>
                      <label className="grid gap-1.5 text-label-sm text-content-secondary">
                        <span>{DOCUMENT_LABELS.business_register[ar ? 'ar' : 'en']}</span>
                        <input aria-label={`${text.businessRegister} ${text.uploadDocument}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setVerificationDocuments((current) => ({ ...current, business_register: event.target.files?.[0] }))} className="min-h-11 rounded-md border border-line bg-bg-surface px-3 py-2 text-body-sm text-content-primary" />
                      </label>
                      <label className="grid gap-1.5 text-label-sm text-content-secondary">
                        <span>{DOCUMENT_LABELS.project_proof[ar ? 'ar' : 'en']}</span>
                        <input aria-label={`${text.projectProof} ${text.uploadDocument}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setVerificationDocuments((current) => ({ ...current, project_proof: event.target.files?.[0] }))} className="min-h-11 rounded-md border border-line bg-bg-surface px-3 py-2 text-body-sm text-content-primary" />
                      </label>
                      <label className="grid gap-1.5 text-label-sm text-content-secondary">
                        <span>{DOCUMENT_LABELS.tax[ar ? 'ar' : 'en']}</span>
                        <input aria-label={`${DOCUMENT_LABELS.tax[ar ? 'ar' : 'en']} ${text.uploadDocument}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setVerificationDocuments((current) => ({ ...current, tax: event.target.files?.[0] }))} className="min-h-11 rounded-md border border-line bg-bg-surface px-3 py-2 text-body-sm text-content-primary" />
                      </label>
                      <Input label={text.projects} name="projects_count" type="number" min="0" max="100000" value={verificationForm.projects} onChange={(event) => setVerificationForm((current) => ({ ...current, projects: event.target.value }))} />
                      <div className="sm:col-span-2 flex flex-wrap gap-3">
                        {company?.verification_status !== 'rejected' && <Button type="submit" loading={busy}>{text.saveApplication}</Button>}
                        {company?.verification_status === 'rejected' && (
                          <Button type="button" variant="secondary" loading={busy} onClick={() => { void resubmitVerification(); }}>
                            {text.resubmitVerification}
                          </Button>
                        )}
                      </div>
                    </form>
                  </>
                )}
              </section>
              <h2 className="mt-7 text-h3 text-content-primary">{text.inbox}</h2>
              <section aria-label={ar ? 'إدارة المشاريع والطلبات' : 'Projects and RFQ hub'} className="mt-7">
                <h2 className="text-h3 text-content-primary">{ar ? 'إدارة المشاريع وطلبات الأسعار' : 'Projects & RFQ Hub'}</h2>
                <div role="tablist" aria-label={ar ? 'أقسام المشاريع' : 'Company project sections'} className="mt-4 flex flex-wrap gap-2 border-b border-line-subtle">
                  {([
                    ['incoming', text.incomingRfqsTab],
                    ['active', text.activeProjectsTab],
                    ['completed', text.completedPortfolioTab],
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={companyProjectTab === tab}
                      onClick={() => setCompanyProjectTab(tab)}
                      className={`border-b-2 px-4 py-3 text-label-sm ${companyProjectTab === tab ? 'border-line-brand text-content-brand' : 'border-transparent text-content-secondary'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              {requests.length > 0 && (
                <div className="mt-5 grid gap-4 rounded-lg border border-line-subtle bg-bg-subtle p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    label={text.searchRequests}
                    name="request-search"
                    type="search"
                    value={requestSearch}
                    onChange={(event) => setRequestSearch(event.target.value)}
                  />
                  <label className="grid gap-1.5 text-label-sm text-content-secondary">
                    <span>{text.filterRequests}</span>
                    <select
                      value={requestStatusFilter}
                      onChange={(event) => setRequestStatusFilter(event.target.value as typeof requestStatusFilter)}
                      className="platform-select"
                    >
                      <option value="all">{text.allRequests}</option>
                      <option value="open">{text.openRequests}</option>
                      <option value="quoted">{text.quotedRequests}</option>
                      <option value="selected">{text.selectedRequests}</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-label-sm text-content-secondary">
                    <span>{text.filterGovernorate}</span>
                    <select
                      aria-label={text.filterGovernorate}
                      value={requestGovernorateFilter}
                      onChange={(event) => {
                        setRequestGovernorateFilter(event.target.value);
                        setRequestDistrictFilter('');
                      }}
                      className="platform-select"
                    >
                      <option value="">{text.allLocations}</option>
                      {requestGovernorates.map((governorate) => <option key={governorate} value={governorate}>{governorate}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-label-sm text-content-secondary">
                    <span>{text.filterDistrict}</span>
                    <select
                      aria-label={text.filterDistrict}
                      value={requestDistrictFilter}
                      onChange={(event) => setRequestDistrictFilter(event.target.value)}
                      className="platform-select"
                    >
                      <option value="">{text.allLocations}</option>
                      {requestDistricts.map((district) => <option key={district} value={district}>{district}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {requests.length === 0 ? <p className="mt-4 border-y border-line-subtle py-8 text-body text-content-secondary">{text.empty}</p> : (
                visibleRequests.length === 0
                  ? <p role="status" className="mt-4 border-y border-line-subtle py-8 text-body text-content-secondary">{text.noMatchingRequests}</p>
                  : <div className="mt-5 flex flex-col gap-6">
                  {visibleRequests.map((request) => {
                    const quote = request.companies[0]?.quote;
                    const assignmentStatus = request.companies[0]?.status ?? 'sent';
                    const depositPayment = request.companies[0]?.payment;
                    const lifecycleStatus = request.companies[0]?.lifecycle_status;
                    const workWasAuthorized = Boolean(request.companies[0]?.work_authorized_at)
                      || ['in_progress', 'pending_review', 'changes_requested', 'approved'].includes(lifecycleStatus ?? '');
                    const values = quotes[request.group_id] ?? {};
                    const completedProject = request.companies[0]?.completed_projects?.[0];
                    const completionValues = completionForms[request.group_id] ?? {};
                    const technicalValues = technicalEdits[request.group_id] ?? {};
                    const canEditTechnicalDetails = !completedProject
                      && !request.companies[0]?.customer_contract_signed
                      && !request.companies[0]?.company_contract_signed
                      && !workWasAuthorized
                      && !['pending_review', 'approved'].includes(lifecycleStatus ?? '');
                    const quotedTotal = Number(values.total ?? quote?.total_iqd ?? 0);
                    const itemizedTotal = Number(values.panelCost ?? quote?.panel_iqd ?? 0)
                      + Number(values.inverterCost ?? quote?.inverter_iqd ?? 0)
                      + Number(values.batteryCost ?? quote?.battery_iqd ?? 0)
                      + Number(values.installationCost ?? quote?.installation_iqd ?? 0);
                    return <Fragment key={request.group_id}>
                    <article
                      data-notification-request-id={request.group_id}
                      className="border-y border-line-subtle py-6"
                    >
                      <MarkViewedOnScreen
                        enabled={assignmentStatus === 'sent' && Boolean(token)}
                        onViewed={() => {
                          void api.markRequestViewed(token, request.group_id).then(() => {
                            setRequests((current) => current.map((item) => (
                              item.group_id === request.group_id
                                ? { ...item, companies: item.companies.map((entry) => (entry.status === 'sent' ? { ...entry, status: 'viewed' } : entry)) }
                                : item
                            )));
                          }).catch(() => {
                            // Not critical: the request simply stays "sent" until the next view.
                          });
                        }}
                      />
                      <div className="flex flex-wrap justify-between gap-3">
                        <h3 className="text-h4 text-content-primary">{request.group_id}</h3>
                        <span className="text-label-sm text-content-tertiary">{request.companies[0]?.status}</span>
                      </div>
                      <div className="mt-3">
                        <Button type="button" variant="secondary" onClick={() => setProjectDetailsRequest(request)}>{text.viewProjectDetails}</Button>
                      </div>
                      {request.is_green_initiative && (
                        <span className="mt-2 inline-flex rounded-full border border-line-brand bg-[var(--brand-subtle)] px-3 py-1 text-label-sm text-content-primary">
                          {text.greenBadge}
                        </span>
                      )}
                      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-body-sm">
                        <div><dt className="text-content-tertiary">{text.customer}</dt><dd className="text-content-primary">{request.customer_name} · {request.customer_phone ?? <span className="text-content-tertiary">{text.phoneAfterDeposit}</span>}</dd></div>
                        <div><dt className="text-content-tertiary">{text.system}</dt><dd className="numeric text-content-primary">{request.system_kwp} kWp · {request.battery_kwh} kWh · {request.panel_count} panels</dd></div>
                        {request.details.governorate && <div><dt className="text-content-tertiary">{text.requestLocation}</dt><dd className="text-content-primary">{[request.details.governorate, request.details.district].filter(Boolean).join(' · ')}</dd></div>}
                        {request.details.systemType && <div><dt className="text-content-tertiary">{text.requestSystemType}</dt><dd className="text-content-primary">{request.details.systemType}</dd></div>}
                        {request.details.budget && <div><dt className="text-content-tertiary">{text.requestBudget}</dt><dd className="numeric text-content-primary">{request.details.budget}</dd></div>}
                        {request.is_green_initiative && request.green_initiative_budget_iqd && (
                          <div>
                            <dt className="text-content-tertiary">{text.greenBudget}</dt>
                            <dd className="numeric text-content-primary">
                              {request.green_initiative_budget_iqd.toLocaleString('en-US')} IQD
                            </dd>
                          </div>
                        )}
                        {request.details.timeline && <div><dt className="text-content-tertiary">{text.requestTimeline}</dt><dd className="text-content-primary">{request.details.timeline}</dd></div>}
                        {request.details.financing !== undefined && <div><dt className="text-content-tertiary">{text.requestFinancing}</dt><dd className="text-content-primary">{request.details.financing ? text.yes : text.no}</dd></div>}
                      </dl>
                      {request.details.notes && <p className="mt-3 text-body-sm text-content-secondary"><strong>{text.requestNotes}: </strong>{request.details.notes}</p>}
                      {canEditTechnicalDetails && (
                        <form className="mt-5 grid gap-3 rounded-lg border border-line-subtle bg-bg-subtle p-4 sm:grid-cols-2" onSubmit={(event) => { void saveTechnicalDetails(event, request); }}>
                          <h4 className="text-label text-content-primary sm:col-span-2">{text.technicalSpecifications}</h4>
                          <Input
                            label={text.roofArea}
                            name={`roof_area_${request.group_id}`}
                            maxLength={120}
                            value={technicalValues.roofArea ?? request.details.roofArea ?? ''}
                            onChange={(event) => setTechnicalEdits((current) => ({
                              ...current,
                              [request.group_id]: { ...current[request.group_id], roofArea: event.target.value },
                            }))}
                          />
                          <Input
                            label={text.siteDimensions}
                            name={`site_dimensions_${request.group_id}`}
                            maxLength={120}
                            value={technicalValues.siteDimensions ?? request.details.siteDimensions ?? ''}
                            onChange={(event) => setTechnicalEdits((current) => ({
                              ...current,
                              [request.group_id]: { ...current[request.group_id], siteDimensions: event.target.value },
                            }))}
                          />
                          <div className="sm:col-span-2"><Button type="submit" variant="secondary" loading={busy}>{text.updateTechnicalDetails}</Button></div>
                        </form>
                      )}
                      {request.companies[0]?.company_id != null && (
                        <RequestChat
                          groupId={request.group_id}
                          companyId={request.companies[0].company_id}
                          companyName={request.companies[0].company_name ?? company?.name ?? (ar ? 'الشركة' : 'Company')}
                          requestSummary={`${request.system_kwp} kWp · ${request.battery_kwh} kWh`}
                          quoteTotal={quote?.total_iqd}
                          contactUnlocked={hasActiveDeposit(depositPayment)}
                          customerPhone={request.customer_phone}
                          companyPhone={company?.phone}
                          companySupportPhone={company?.support_phone}
                          companyToken={token}
                        />
                      )}
                      {hasActiveDeposit(depositPayment) && (
                        <aside
                          role="status"
                          data-notification-payment={request.group_id}
                          className="mt-4 rounded-lg border border-[var(--status-success)] bg-[var(--status-success-bg)] px-4 py-3 text-body-sm text-content-primary"
                        >
                          <p className="font-medium">{text.depositConfirmed}</p>
                          <p className="mt-1">{text.transactionId}: {depositPayment.transaction_id}</p>
                          <p>{text.depositValue}: {depositPayment.deposit_iqd.toLocaleString('en-US')} IQD · {text.balanceValue}: {depositPayment.remaining_iqd.toLocaleString('en-US')} IQD</p>
                          <p className="mt-1 font-medium">
                            {workWasAuthorized
                              ? (ar ? 'أذن العمل / جاهز للتركيب' : 'Work Authorized / Ready for Installation')
                              : (ar
                                ? 'جاهز للتركيب بعد توقيع الطرفين وموافقة الأدمن'
                                : 'Ready for Installation — pending both signatures and admin approval')}
                          </p>
                        </aside>
                      )}
                      {request.companies[0]?.contract && (
                        <ContractDocumentCard contract={request.companies[0].contract} />
                      )}
                      {hasActiveDeposit(depositPayment)
                        && request.companies[0]?.contract
                        && lifecycleStatus === 'awaiting_signatures'
                        && !request.companies[0].company_contract_signed
                        && (
                          <div className="mt-3 rounded-lg border border-line-brand bg-[var(--brand-subtle)] p-4">
                            <Button size="md" loading={busy} onClick={() => void signCompanyContract(request)}>
                              {text.signContract}
                            </Button>
                          </div>
                        )}
                      {lifecycleStatus === 'awaiting_signatures' && (
                        <p role="status" className="mt-3 rounded-lg border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">
                          {text.waitingContractSignature}
                        </p>
                      )}
                      {lifecycleStatus === 'awaiting_admin_approval' && (
                        <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-body-sm text-slate-800">
                          {text.awaitingAdminStart}
                        </p>
                      )}
                      {lifecycleStatus === 'in_progress' && request.companies[0]?.work_authorized_at && (
                        <aside role="status" className="mt-3 rounded-lg border border-[var(--status-success)] bg-[var(--status-success-bg)] px-4 py-3 text-body-sm text-content-primary">
                          <p className="font-semibold">{text.workAuthorizedTitle}</p>
                          <p className="mt-1">{text.workAuthorizedNotification}</p>
                        </aside>
                      )}
                      {lifecycleStatus === 'pending_review' && (
                        <p role="status" className="mt-4 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-bg)] px-4 py-3 text-body-sm text-content-secondary">{text.awaitingAdminCompletion}</p>
                      )}
                      {lifecycleStatus === 'changes_requested' && request.companies[0]?.admin_feedback && (
                        <p role="alert" className="mt-4 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-bg)] px-4 py-3 text-body-sm text-content-secondary">{text.changesRequested}: {request.companies[0].admin_feedback}</p>
                      )}
                      {verificationStage(company?.verification_status) === 0 && (
                        <p role="note" className="mt-4 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-bg)] px-4 py-3 text-body-sm text-content-secondary">
                          {text.pendingRequestPrompt}
                        </p>
                      )}
                      {assignmentStatus === 'selected' && !completedProject && !depositPayment && (
                        <p role="note" className="mt-4 rounded-lg border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">{text.quoteLocked}</p>
                      )}
                      {verificationStage(company?.verification_status) >= 1 && !completedProject && !depositPayment && assignmentStatus !== 'selected' && <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => submitQuote(event, request)}>
                        <Input label={text.amount} name="amount" type="number" min="1" required value={values.total ?? quote?.total_iqd ?? ''} onChange={(event) => setQuoteField(request.group_id, 'total', event.target.value)} />
                        <Input label={text.capacity} name="capacity" type="number" min="0.1" step="0.1" required value={values.capacity ?? quote?.capacity_kwp ?? request.system_kwp} onChange={(event) => setQuoteField(request.group_id, 'capacity', event.target.value)} />
                        <Input label={text.panelCost} name="panel_cost" type="number" min="0" step="1" required value={values.panelCost ?? (quote?.panel_iqd ? String(quote.panel_iqd) : '')} onChange={(event) => setQuoteField(request.group_id, 'panelCost', event.target.value)} />
                        <Input label={text.inverterCost} name="inverter_cost" type="number" min="0" step="1" required value={values.inverterCost ?? (quote?.inverter_iqd ? String(quote.inverter_iqd) : '')} onChange={(event) => setQuoteField(request.group_id, 'inverterCost', event.target.value)} />
                        <Input label={text.batteryCost} name="battery_cost" type="number" min="0" step="1" required value={values.batteryCost ?? (quote?.battery_iqd ? String(quote.battery_iqd) : '')} onChange={(event) => setQuoteField(request.group_id, 'batteryCost', event.target.value)} />
                        <Input label={text.installationCost} name="installation_cost" type="number" min="0" step="1" required value={values.installationCost ?? (quote?.installation_iqd ? String(quote.installation_iqd) : '')} onChange={(event) => setQuoteField(request.group_id, 'installationCost', event.target.value)} />
                        <p className="text-body-sm text-content-secondary sm:col-span-2">{text.itemizedTotal}: <strong className="numeric text-content-primary">{itemizedTotal.toLocaleString('en-US')} IQD</strong>{quotedTotal > 0 && quotedTotal !== itemizedTotal && <span className="ms-2 text-[var(--status-danger)]">{text.itemizedMismatch}</span>}</p>
                        <Input label={text.panel} name="panel" required value={values.panel ?? quote?.panel_brand ?? ''} onChange={(event) => setQuoteField(request.group_id, 'panel', event.target.value)} />
                        <Input label={text.inverter} name="inverter" required value={values.inverter ?? quote?.inverter_brand ?? ''} onChange={(event) => setQuoteField(request.group_id, 'inverter', event.target.value)} />
                        <Input label={text.battery} name="battery" required value={values.battery ?? quote?.battery_brand ?? ''} onChange={(event) => setQuoteField(request.group_id, 'battery', event.target.value)} />
                        <Input label={text.warranty} name="warranty" required value={values.warranty ?? quote?.warranty ?? ''} onChange={(event) => setQuoteField(request.group_id, 'warranty', event.target.value)} />
                        <Input label={text.days} name="days" type="number" min="1" max="365" required value={values.days ?? quote?.install_days ?? ''} onChange={(event) => setQuoteField(request.group_id, 'days', event.target.value)} />
                        <Input label={text.valid} name="valid" type="number" min="1" max="90" required value={values.valid ?? quote?.valid_days ?? 14} onChange={(event) => setQuoteField(request.group_id, 'valid', event.target.value)} />
                        <div className="sm:col-span-2">
                          <label className="flex items-center gap-2 text-label text-content-secondary"><input type="checkbox" checked={values.financing ?? quote?.financing ?? false} onChange={(event) => setQuoteField(request.group_id, 'financing', event.target.checked)} />{text.financing}</label>
                          <p className="mt-1 text-body-sm text-content-tertiary">{text.financingHelp}</p>
                        </div>
                        {(values.financing ?? quote?.financing ?? false) && (
                          <>
                            <Input
                              label={text.downPayment}
                              name="down_payment"
                              type="number"
                              min="0"
                              max={Math.max(0, Number(values.total ?? quote?.total_iqd ?? 0) - 1)}
                              step="1"
                              required
                              value={values.downPayment ?? quote?.down_payment_iqd ?? ''}
                              onChange={(event) => setQuoteField(request.group_id, 'downPayment', event.target.value)}
                            />
                            <label className="grid gap-1.5 text-label-sm text-content-secondary">
                              {text.installmentMonths}
                              <select
                                required
                                aria-label={text.installmentMonths}
                                value={values.installmentMonths ?? String(quote?.installment_months ?? 12)}
                                onChange={(event) => setQuoteField(request.group_id, 'installmentMonths', event.target.value)}
                                className="platform-select"
                              >
                                {[3, 6, 12, 24].map((months) => (
                                  <option key={months} value={months}>{months} {text.months}</option>
                                ))}
                              </select>
                            </label>
                            {(() => {
                              const total = Number(values.total ?? quote?.total_iqd ?? 0);
                              const downPayment = Number(values.downPayment ?? quote?.down_payment_iqd ?? 0);
                              const months = Number(values.installmentMonths ?? quote?.installment_months ?? 12);
                              const calculated = total > downPayment && months > 0
                                ? Math.max(1, Math.round((total - downPayment) / months))
                                : 0;
                              const displayed = values.autoCalculateInstallment
                                ? String(calculated)
                                : values.monthlyInstallment || (
                                  quote?.monthly_installment_iqd != null && !values.downPayment && !values.total && !values.installmentMonths
                                    ? String(quote.monthly_installment_iqd)
                                    : String(calculated)
                                );
                              return (
                                <div className="sm:col-span-2">
                                  <Input
                                    label={text.monthlyInstallment}
                                    name="monthly_installment"
                                    type="number"
                                    min="1"
                                    step="1"
                                    required
                                    value={displayed}
                                    onChange={(event) => setQuoteField(request.group_id, 'monthlyInstallment', event.target.value)}
                                  />
                                  {!values.autoCalculateInstallment && (values.monthlyInstallment || quote?.monthly_installment_iqd) && (
                                    <button
                                      type="button"
                                      className="mt-1 text-label-sm text-content-secondary underline"
                                      onClick={() => setQuotes((current) => ({
                                        ...current,
                                        [request.group_id]: {
                                          ...current[request.group_id],
                                          monthlyInstallment: '',
                                          autoCalculateInstallment: true,
                                        },
                                      }))}
                                    >
                                      {text.useCalculatedInstallment}
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}
                        {request.is_green_initiative && (
                          <div className="sm:col-span-2">
                            <label className="flex items-center gap-2 text-label text-content-secondary">
                              <input
                                type="checkbox"
                                checked={values.greenInitiativeSupported ?? quote?.green_initiative_supported ?? false}
                                onChange={(event) => setQuoteField(request.group_id, 'greenInitiativeSupported', event.target.checked)}
                              />
                              {text.greenSupport}
                            </label>
                            <p className="mt-1 text-body-sm text-content-tertiary">{text.greenSupportHelp}</p>
                          </div>
                        )}
                        <Textarea label={text.notes} rows={3} maxLength={2000} value={values.notes ?? quote?.notes ?? ''} onChange={(event) => setQuoteField(request.group_id, 'notes', event.target.value)} />
                        <div className="sm:col-span-2"><Button type="submit" loading={busy}>{text.send}</Button></div>
                      </form>}
                      {verificationStage(company?.verification_status) === 0 && !quote && <p className="mt-5 rounded-md border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">{text.verificationRequired}</p>}
                      {completedProject ? (
                        <p role="status" className="mt-5 rounded-lg border border-[var(--status-success)] bg-[var(--status-success-bg)] px-4 py-3 text-body-sm text-[var(--status-success)]">
                          {text.projectCompleted}: {completedProject.title}
                        </p>
                      ) : quote && assignmentStatus !== 'selected' ? (
                        <p role="status" className="mt-5 rounded-md border border-line-subtle bg-bg-subtle px-4 py-3 text-body-sm text-content-secondary">
                          {text.waitingForAcceptance}
                        </p>
                      ) : quote && verificationStage(company?.verification_status) >= 1 && (lifecycleStatus === 'in_progress' || lifecycleStatus === 'changes_requested') ? (
                        <form noValidate className="mt-6 grid gap-4 border-t border-line-subtle pt-5 sm:grid-cols-2" onSubmit={(event) => completeInstallation(event, request)}>
                          <h3 className="text-label text-content-primary sm:col-span-2">{text.completionTitle}</h3>
                          <Input label={text.installationTitle} name={`project_title_${request.group_id}`} required minLength={2} value={completionValues.title ?? ''} onChange={(event) => setCompletionField(request.group_id, 'title', event.target.value)} />
                          <Input label={text.installationType} name={`installation_type_${request.group_id}`} required minLength={2} value={completionValues.installationType ?? ''} onChange={(event) => setCompletionField(request.group_id, 'installationType', event.target.value)} />
                          <Textarea label={text.installationDescription} rows={3} maxLength={2000} className="sm:col-span-2" value={completionValues.description ?? ''} onChange={(event) => setCompletionField(request.group_id, 'description', event.target.value)} />
                          <label className="grid gap-1.5 text-label-sm text-content-secondary sm:col-span-2">
                            <span>{text.completionPhoto}</span>
                            <input
                              aria-label={text.completionPhoto}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              required
                              onChange={(event) => setCompletionProofFiles((current) => ({
                                ...current,
                                [request.group_id]: event.target.files?.[0],
                              }))}
                              className="min-h-11 rounded-md border border-line bg-bg-surface px-3 py-2 text-body-sm text-content-primary"
                            />
                            {completionProofFiles[request.group_id] && <span className="text-body-xs text-content-tertiary">{completionProofFiles[request.group_id]?.name}</span>}
                          </label>
                          {completionErrors[request.group_id] && (
                            <p role="alert" className="rounded-md border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-4 py-3 text-body-sm text-[var(--status-danger)] sm:col-span-2">
                              {completionErrors[request.group_id]}
                            </p>
                          )}
                          <div className="sm:col-span-2"><Button type="submit" loading={busy}>{text.completeInstallation}</Button></div>
                        </form>
                      ) : null}
                    </article>
                    </Fragment>;
                  })}
                </div>
              )}
            </section>
            </section>
          )}
        </div>
        {projectDetailsRequest && (() => {
          const assignment = projectDetailsRequest.companies[0];
          const contract = assignment?.contract;
          const quote = assignment?.quote;
          const technicalDetails: [string, string | number | null | undefined][] = [
            [text.system, `${projectDetailsRequest.system_kwp} kWp · ${projectDetailsRequest.battery_kwh} kWh · ${projectDetailsRequest.panel_count} panels`],
            [text.requestSystemType, projectDetailsRequest.details.systemType],
            [ar ? 'نوع العقار' : 'Property type', projectDetailsRequest.details.propertyType],
            [ar ? 'نوع السطح' : 'Roof type', projectDetailsRequest.details.roofType],
            [text.roofArea, projectDetailsRequest.details.roofArea],
            [text.siteDimensions, projectDetailsRequest.details.siteDimensions],
            [text.requestLocation, [projectDetailsRequest.details.governorate, projectDetailsRequest.details.district].filter(Boolean).join(' · ')],
            [ar ? 'حالة الشبكة' : 'Grid status', projectDetailsRequest.details.gridStatus],
            [text.requestBudget, projectDetailsRequest.details.budget],
            [text.requestTimeline, projectDetailsRequest.details.timeline],
            [text.requestFinancing, projectDetailsRequest.details.financing === undefined ? undefined : (projectDetailsRequest.details.financing ? text.yes : text.no)],
            [ar ? 'الدفعة الأولى' : 'Down payment', projectDetailsRequest.details.down_payment_iqd?.toLocaleString('en-US')],
            [ar ? 'مدة التقسيط' : 'Installment term', projectDetailsRequest.details.installment_months],
            [ar ? 'القسط الشهري' : 'Monthly installment', projectDetailsRequest.details.monthly_installment_iqd?.toLocaleString('en-US')],
            [ar ? 'نسبة المبادرة الخضراء' : 'Green Initiative rate', projectDetailsRequest.details.greenInitiativeRate],
            [ar ? 'التواصل عبر واتساب' : 'WhatsApp contact requested', projectDetailsRequest.details.whatsapp === undefined ? undefined : (projectDetailsRequest.details.whatsapp ? text.yes : text.no)],
            [text.greenBudget, projectDetailsRequest.green_initiative_budget_iqd?.toLocaleString('en-US')],
            [text.requestNotes, projectDetailsRequest.details.notes],
          ];
          const contractHistory = [
            [ar ? 'تم إرسال الطلب' : 'Request submitted', projectDetailsRequest.created_at],
            [ar ? 'تم إرسال العرض' : 'Quote submitted', quote?.created_at],
            [ar ? 'إنشاء العقد' : 'Contract created', contract?.created_at],
            [ar ? 'توقيع الزبون' : 'Customer signature', assignment?.customer_contract_signed ? (ar ? 'موقّع' : 'Signed') : (ar ? 'بانتظار التوقيع' : 'Awaiting signature')],
            [ar ? 'توقيع الشركة' : 'Company signature', assignment?.company_contract_signed ? (ar ? 'موقّع' : 'Signed') : (ar ? 'بانتظار التوقيع' : 'Awaiting signature')],
            [ar ? 'إذن المباشرة' : 'Work authorization', assignment?.work_authorized_at],
            [ar ? 'حالة المشروع' : 'Project status', assignment?.lifecycle_status ?? assignment?.status],
            [ar ? 'حالة العربون' : 'Deposit status', assignment?.payment?.payment_status],
            [ar ? 'اكتمال المشروع' : 'Project completed', assignment?.completed_projects?.[0]?.completed_at],
          ] as const;
          return (
            <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4" onClick={() => setProjectDetailsRequest(null)}>
              <section
                role="dialog"
                aria-modal="true"
                aria-label={`${text.projectDetails}: ${projectDetailsRequest.group_id}`}
                className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-bg-surface p-5 shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-4">
                  <div>
                    <h2 className="text-h3 text-content-primary">{text.projectDetails}</h2>
                    <p className="mt-1 text-body-sm text-content-secondary">{projectDetailsRequest.group_id} · {assignment?.status}</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setProjectDetailsRequest(null)}>{text.closePreview}</Button>
                </header>
                <section className="mt-5">
                  <h3 className="text-h4 text-content-primary">{text.customerDetails}</h3>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div><dt className="text-body-xs text-content-tertiary">{text.customer}</dt><dd className="text-body-sm text-content-primary">{projectDetailsRequest.customer_name}</dd></div>
                    <div><dt className="text-body-xs text-content-tertiary">{text.phone}</dt><dd className="text-body-sm text-content-primary">{projectDetailsRequest.customer_phone ?? text.phoneAfterDeposit}</dd></div>
                  </dl>
                </section>
                <section className="mt-5">
                  <h3 className="text-h4 text-content-primary">{text.technicalSpecifications}</h3>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {technicalDetails.filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => (
                      <div key={label}><dt className="text-body-xs text-content-tertiary">{label}</dt><dd className="whitespace-pre-wrap text-body-sm text-content-primary">{value}</dd></div>
                    ))}
                    {quote && <>
                      <div><dt className="text-body-xs text-content-tertiary">{ar ? 'السعة المعروضة' : 'Quoted capacity'}</dt><dd className="text-body-sm text-content-primary">{quote.capacity_kwp} kWp</dd></div>
                      <div><dt className="text-body-xs text-content-tertiary">{text.panel}</dt><dd className="text-body-sm text-content-primary">{quote.panel_brand}</dd></div>
                      <div><dt className="text-body-xs text-content-tertiary">{text.inverter}</dt><dd className="text-body-sm text-content-primary">{quote.inverter_brand}</dd></div>
                      <div><dt className="text-body-xs text-content-tertiary">{text.battery}</dt><dd className="text-body-sm text-content-primary">{quote.battery_brand}</dd></div>
                      <div><dt className="text-body-xs text-content-tertiary">{text.warranty}</dt><dd className="text-body-sm text-content-primary">{quote.warranty}</dd></div>
                      <div><dt className="text-body-xs text-content-tertiary">{text.amount}</dt><dd className="numeric text-body-sm text-content-primary">{quote.total_iqd.toLocaleString('en-US')} IQD</dd></div>
                    </>}
                  </dl>
                </section>
                <section className="mt-5">
                  <h3 className="text-h4 text-content-primary">{text.contractHistory}</h3>
                  <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                    {contractHistory.filter(([, value]) => Boolean(value)).map(([label, value], index) => (
                      <li key={`${label}-${index}`} className="rounded-md border border-line-subtle bg-bg-subtle px-3 py-2">
                        <span className="block text-body-xs text-content-tertiary">{label}</span>
                        <span className="text-body-sm text-content-primary">{value}</span>
                      </li>
                    ))}
                  </ol>
                  {(assignment?.lifecycle_audit?.length ?? 0) > 0 && (
                    <ol aria-label={text.contractHistory} className="mt-3 grid gap-2 sm:grid-cols-2">
                      {assignment?.lifecycle_audit?.map((entry, index) => (
                        <li key={`${entry.event}-${entry.at}-${index}`} className="rounded-md border border-line-subtle px-3 py-2">
                          <span className="block text-body-xs text-content-tertiary">{entry.at}</span>
                          <span className="text-body-sm text-content-primary">{entry.event}</span>
                          {entry.feedback && <p className="mt-1 text-body-xs text-content-secondary">{entry.feedback}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {contract && <div className="mt-4"><ContractDocumentCard contract={contract} /></div>}
                </section>
              </section>
            </div>
          );
        })()}
        {adminProofPreview && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4" onClick={() => setAdminProofPreview(null)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label={ar ? 'صورة إثبات الإنجاز' : 'Completion proof photo'}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-bg-surface p-4 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="text-label text-content-primary">{ar ? 'صورة إثبات الإنجاز' : 'Completion proof photo'}</h2>
                <Button type="button" variant="secondary" size="md" onClick={() => setAdminProofPreview(null)}>{text.closePreview}</Button>
              </div>
              <img src={adminProofPreview} alt={ar ? 'صورة تنفيذ المنظومة الشمسية' : 'Installed solar system completion proof'} className="max-h-[75vh] max-w-full self-center object-contain" />
            </section>
          </div>
        )}
        {previewDocument && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPreviewDocument(null)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label={previewDocument.file_name}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-bg-surface p-4 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="truncate text-label text-content-primary">{previewDocument.file_name}</h2>
                <Button type="button" variant="secondary" size="md" onClick={() => setPreviewDocument(null)}>{text.closePreview}</Button>
              </div>
              {previewDocument.content_type.startsWith('image/') ? (
                <img
                  src={`data:${previewDocument.content_type};base64,${previewDocument.data_base64}`}
                  alt={previewDocument.file_name}
                  className="max-h-[75vh] max-w-full self-center object-contain"
                />
              ) : previewDocument.content_type === 'application/pdf' ? (
                <iframe
                  title={previewDocument.file_name}
                  src={`data:application/pdf;base64,${previewDocument.data_base64}`}
                  sandbox=""
                  className="h-[75vh] w-full border-0"
                />
              ) : (
                <p role="alert" className="text-body-sm text-[var(--status-danger)]">{text.documentUnavailable}</p>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
