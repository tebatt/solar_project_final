import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  type ApiCompany,
  type ApiProject,
  type ApiReview,
  type AuthUser,
  type CompanyPortalRequest,
  type LifecycleAdminItem,
} from '../api/client';
import { AuthModal } from '../components/auth/AuthModal';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { CompanyPortalPage } from './CompanyPortalPage';
import { AUTH_TOKEN_KEY, AuthProvider } from '../state/AuthContext';

vi.mock('../api/client', () => ({
  ApiError: class extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  isActiveDeposit: (status: string | null | undefined) => status === 'simulated' || status === 'paid',
  hasActiveDeposit: (payment: { payment_status: string } | null | undefined) =>
    Boolean(payment && (payment.payment_status === 'simulated' || payment.payment_status === 'paid')),
  api: {
    authMe: vi.fn(),
    authLogin: vi.fn(),
    authRegisterCompany: vi.fn(),
    adminPendingCompanies: vi.fn(),
    adminAllCompanies: vi.fn().mockResolvedValue([]),
    adminUsers: vi.fn().mockResolvedValue([]),
    adminReviews: vi.fn().mockResolvedValue([]),
    setAdminCompanyBlocked: vi.fn(),
    setAdminClientActive: vi.fn(),
    setAdminReviewHidden: vi.fn(),
    deleteAdminReview: vi.fn(),
    adminRevenue: vi.fn(),
    refundDepositPayment: vi.fn(),
    adminPolicyReports: vi.fn(),
    adminVerificationDocument: vi.fn(),
    updatePolicyReportStatus: vi.fn(),
    reviewCompany: vi.fn(),
    listProjects: vi.fn(),
    updateProjectStatus: vi.fn(),
    listAdminLifecycle: vi.fn(),
    getAdminCompletionProof: vi.fn(),
    reviewProjectLifecycle: vi.fn(),
    authorizeProjectWork: vi.fn(),
    setProjectFeatured: vi.fn(),
    companyProfile: vi.fn(),
    updateCompanySupportPhone: vi.fn(),
    updateCompanyProfileContacts: vi.fn(),
    updateCompanyBranches: vi.fn(),
    companyInbox: vi.fn(),
    chatMessages: vi.fn(),
    sendChatMessage: vi.fn(),
    submitCompanyQuote: vi.fn(),
    completeCompanyInstallation: vi.fn(),
    signCompanyContract: vi.fn(),
    updateCompanyVerification: vi.fn(),
    uploadVerificationDocument: vi.fn(),
    resubmitCompanyVerification: vi.fn(),
    updateCompanyRequestTechnicalDetails: vi.fn(),
  },
}));

vi.mock('../api/useCompanies', () => ({ invalidateCompanies: vi.fn() }));

afterEach(cleanup);

const pendingCompany: ApiCompany = {
  id: 4,
  name: 'Sun Company',
  logo_url: null,
  founded_year: 2020,
  projects_count: 0,
  phone: '07700000000',
  email: 'sun@example.com',
  address: 'Baghdad',
  verification_status: 'pending',
  rating: 0,
  reviews_count: 0,
  business_license_number: 'LIC-123',
  tax_registration_number: undefined,
  has_license_document: true,
  has_tax_document: true,
  verification_documents: ['license', 'national_id'],
};

const verifiedCompany: ApiCompany = {
  ...pendingCompany,
  verification_status: 'verified',
};

const adminProject: ApiProject = {
  id: 8,
  title: 'Residential Solar System',
  description: 'A completed rooftop installation.',
  company_id: 4,
  company: {
    id: 4,
    name: 'Sun Company',
    logo_url: null,
    founded_year: 2020,
    projects_count: 1,
    address: 'Baghdad',
    verification_status: 'verified',
  },
  client_name: 'Test Customer',
  location_governorate: 'Baghdad',
  location_district: 'Al-Jadriya',
  system_kwp: 8.4,
  battery_kwh: 10,
  installation_type: 'hybrid',
  rating: 0,
  image_url: '',
  gallery_urls: [],
  status: 'in_progress',
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  panel_count: 12,
  roof_type: 'flat',
  inverter_details: null,
  annual_generation_kwh: null,
  testimonial: null,
};

const pendingLifecycle: LifecycleAdminItem = {
  assignment_id: 17,
  request_id: 'UTU-2026-REVIEW',
  customer_name: 'Test Customer',
  company_id: 4,
  company_name: 'Sun Company',
  assignment_status: 'selected',
  stage: 'completion_pending_review',
  quote: null,
  contract: {
    contract_id: 'UTU-2026-REVIEW-17',
    customer_name: 'Test Customer',
    company_name: 'Sun Company',
    specifications: {
      system_kwp: 8.4,
      battery_kwh: 10,
      panel_count: 12,
      governorate: 'Baghdad',
      district: 'Al-Jadriya',
    },
    price_iqd: 10_000_000,
    installation_terms: { install_days: 5, warranty: '5 years' },
    signatures: {
      customer: 'Digitally accepted',
      company: 'Digitally agreed',
      platform_stamp: 'UTU DIGITAL AGREEMENT — DEMONSTRATION',
    },
  },
  project: adminProject,
  has_completion_proof: true,
  customer_contract_signed: true,
  company_contract_signed: true,
  work_authorized_at: '2026-01-02T00:00:00Z',
  admin_feedback: null,
  audit: [{ event: 'completion_submitted', at: '2026-01-02T00:00:00Z' }],
  customer_review: null,
  featured: false,
};

const pendingWorkLifecycle: LifecycleAdminItem = {
  ...pendingLifecycle,
  stage: 'pending_work_approval',
  project: null,
  has_completion_proof: false,
  customer_contract_signed: true,
  company_contract_signed: true,
  work_authorized_at: null,
  audit: [
    { event: 'customer_contract_signed', at: '2026-01-01T00:00:00Z' },
    { event: 'company_contract_signed', at: '2026-01-02T00:00:00Z' },
  ],
};

const companyUser: AuthUser = {
  id: 4,
  email: 'sun@example.com',
  phone: '07700000000',
  full_name: 'Sun Company',
  role: 'company',
  is_active: true,
  is_verified: true,
  company_id: 4,
  created_at: '2026-01-01T00:00:00Z',
};

const assignedRequest: CompanyPortalRequest = {
  group_id: 'UTU-2026-COMPANY-TEST',
  status: 'pending',
  created_at: '2026-01-01T00:00:00Z',
  customer_name: 'Test Customer',
  customer_phone: '07711111111',
  system_kwp: 8.4,
  battery_kwh: 10,
  panel_count: 12,
  is_green_initiative: true,
  green_initiative_budget_iqd: 12_000_000,
  details: {
    governorate: 'Baghdad',
    district: 'Al-Jadriya',
    systemType: 'hybrid',
    budget: '20m IQD',
    notes: 'Include installation',
    financing: true,
  },
  companies: [{
    id: 1,
    company_id: 4,
    company_name: 'Sun Company',
    status: 'sent',
    green_verification_id: null,
    quote: null,
    completed_projects: [],
  }],
};

describe('CompanyPortalPage admin requirements', () => {
  it('shows all management tabs and applies company, client, and review moderation changes', async () => {
    localStorage.clear();
    const admin: AuthUser = {
      id: 1,
      email: 'admin@example.com',
      phone: null,
      full_name: 'Platform Admin',
      role: 'admin',
      is_active: true,
      is_verified: true,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    const client: AuthUser = {
      ...admin,
      id: 2,
      email: 'client@example.com',
      phone: '07711111111',
      full_name: 'Test Client',
      role: 'client',
      company_id: null,
    };
    const company: ApiCompany = {
      ...pendingCompany,
      is_blocked: false,
      tax_registration_number: 'TAX-456',
      verification_documents: ['license', 'tax'],
    };
    const review: ApiReview = {
      id: 10,
      company_id: company.id,
      company_name: company.name,
      project_id: 8,
      project_title: 'Residential Solar System',
      system_kwp: 8.4,
      location_governorate: 'Baghdad',
      location_district: 'Al-Jadriya',
      client_name: 'Test Client',
      rating: 4,
      communication_rating: 4,
      work_quality_rating: 4,
      comment: 'Great installation experience.',
      is_verified: true,
      is_hidden: false,
      created_at: '2026-01-01T00:00:00Z',
    };
    const blockedCompany = { ...company, is_blocked: true };
    const blockedClient = { ...client, is_active: false };
    const hiddenReview = { ...review, is_hidden: true };
    localStorage.setItem(AUTH_TOKEN_KEY, 'admin-jwt');
    vi.mocked(api.authMe).mockResolvedValue(admin);
    vi.mocked(api.adminPendingCompanies).mockResolvedValue([]);
    vi.mocked(api.adminAllCompanies).mockResolvedValue([company]);
    vi.mocked(api.adminUsers).mockResolvedValue([client]);
    vi.mocked(api.adminReviews).mockResolvedValue([review]);
    vi.mocked(api.setAdminCompanyBlocked).mockResolvedValue(blockedCompany);
    vi.mocked(api.setAdminClientActive).mockResolvedValue(blockedClient);
    vi.mocked(api.setAdminReviewHidden).mockResolvedValue(hiddenReview);
    vi.mocked(api.listProjects).mockResolvedValue([adminProject]);
    vi.mocked(api.listAdminLifecycle).mockResolvedValue([]);
    vi.mocked(api.adminRevenue).mockResolvedValue([]);
    vi.mocked(api.adminPolicyReports).mockResolvedValue([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <LanguageProvider>
        <AuthProvider>
          <CompanyPortalPage />
        </AuthProvider>
      </LanguageProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load applications' }));
    expect(await screen.findByRole('tab', { name: /Companies Sector/ })).toBeInTheDocument();
    const primaryTabs = within(screen.getByRole('tablist', { name: 'Admin dashboard sections' })).getAllByRole('tab');
    expect(primaryTabs).toHaveLength(3);
    expect(primaryTabs.map((tab) => tab.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Companies Sector'),
      expect.stringContaining('Clients & Projects Sector'),
      expect.stringContaining('Reviews Sector'),
    ]));

    fireEvent.click(screen.getByRole('tab', { name: 'Companies Directory & Management' }));
    expect(await screen.findByText(/LIC-123/)).toBeInTheDocument();
    expect(screen.getByText(/TAX-456/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Block Company' }));
    await waitFor(() => expect(api.setAdminCompanyBlocked).toHaveBeenCalledWith(company.id, true));

    fireEvent.click(screen.getByRole('tab', { name: /Clients & Projects Sector/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Clients Management' }));
    expect(await screen.findByText('Test Client')).toBeInTheDocument();
    expect(screen.getByText('client@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Block Client' }));
    await waitFor(() => expect(api.setAdminClientActive).toHaveBeenCalledWith(client.id, false));

    fireEvent.click(screen.getByRole('tab', { name: /Reviews Sector/ }));
    expect(await screen.findByText('Great installation experience.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Review' }));
    await waitFor(() => expect(api.setAdminReviewHidden).toHaveBeenCalledWith(review.id, true));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Review' }));
    await waitFor(() => expect(api.deleteAdminReview).toHaveBeenCalledWith(review.id));
  });

  it('lets the administrator authorize a contract signed by both parties', async () => {
    localStorage.clear();
    const admin: AuthUser = {
      id: 1,
      email: 'admin@example.com',
      phone: null,
      full_name: 'Platform Admin',
      role: 'admin',
      is_active: true,
      is_verified: true,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem(AUTH_TOKEN_KEY, 'admin-jwt');
    vi.mocked(api.authMe).mockResolvedValue(admin);
    vi.mocked(api.adminPendingCompanies).mockResolvedValue([]);
    vi.mocked(api.adminAllCompanies).mockResolvedValue([]);
    vi.mocked(api.adminUsers).mockResolvedValue([]);
    vi.mocked(api.adminReviews).mockResolvedValue([]);
    vi.mocked(api.listProjects).mockResolvedValue([]);
    vi.mocked(api.listAdminLifecycle).mockResolvedValue([pendingWorkLifecycle]);
    vi.mocked(api.adminRevenue).mockResolvedValue([]);
    vi.mocked(api.adminPolicyReports).mockResolvedValue([]);
    vi.mocked(api.authorizeProjectWork).mockResolvedValue({
      ...pendingWorkLifecycle,
      stage: 'contract_in_progress',
      work_authorized_at: '2026-01-03T00:00:00Z',
      audit: [...pendingWorkLifecycle.audit, {
        event: 'work_authorized',
        at: '2026-01-03T00:00:00Z',
      }],
    });
    render(
      <LanguageProvider>
        <AuthProvider>
          <CompanyPortalPage />
        </AuthProvider>
      </LanguageProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load applications' }));
    fireEvent.click(await screen.findByRole('tab', { name: /Clients & Projects Sector/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Projects Management' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve & Start Project' }));

    await waitFor(() => expect(api.authorizeProjectWork).toHaveBeenCalledWith(17));
    expect(await screen.findByText('Work authorized. The customer and company will see the authorization alert in their project.')).toBeInTheDocument();
  });

  it('loads admin applications with the signed-in administrator session and explains approval requirements', async () => {
    localStorage.clear();
    const admin: AuthUser = {
      id: 1,
      email: 'admin@example.com',
      phone: null,
      full_name: 'Platform Admin',
      role: 'admin',
      is_active: true,
      is_verified: true,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem(AUTH_TOKEN_KEY, 'admin-jwt');
    vi.mocked(api.authMe).mockResolvedValue(admin);
    vi.mocked(api.adminPendingCompanies).mockResolvedValue([pendingCompany]);
    vi.mocked(api.adminAllCompanies).mockResolvedValue([pendingCompany]);
    vi.mocked(api.adminUsers).mockResolvedValue([]);
    vi.mocked(api.adminReviews).mockResolvedValue([]);
    vi.mocked(api.reviewCompany).mockResolvedValue({
      ...pendingCompany,
      verification_status: 'verified',
    });
    vi.mocked(api.listProjects).mockResolvedValue([adminProject]);
    vi.mocked(api.listAdminLifecycle).mockResolvedValue([pendingLifecycle]);
    vi.mocked(api.getAdminCompletionProof).mockResolvedValue({
      content_type: 'image/png',
      file_name: 'installation.png',
      data_base64: 'iVBORw0KGgo=',
    });
    vi.mocked(api.reviewProjectLifecycle).mockResolvedValue({
      ...pendingLifecycle,
      stage: 'approved',
      project: { ...adminProject, status: 'completed' },
    });
    vi.mocked(api.updateProjectStatus).mockResolvedValue({
      ...adminProject,
      status: 'completed',
      completed_at: '2026-01-02T00:00:00Z',
    });
    vi.mocked(api.adminRevenue).mockResolvedValue([{
      assignment_id: 5,
      request_id: 2,
      project_id: 8,
      project_title: 'Residential Solar System',
      company_name: 'Sun Company',
      total_agreed_price_iqd: 10_000_000,
      commission_rate: 0.05,
      commission_fee_iqd: 500_000,
      status: 'completed',
      is_estimate: false,
      payment_status: 'paid',
      commission_status: 'collected',
      transaction_id: 'UTU-TEST-123',
      payment_method: 'fib',
      deposit_iqd: 500_000,
      remaining_iqd: 9_500_000,
    }, {
      assignment_id: 23,
      request_id: 13,
      project_id: 12,
      project_title: 'starlink111',
      company_name: 'Black Company',
      total_agreed_price_iqd: 20,
      commission_rate: 0.05,
      commission_fee_iqd: 1,
      status: 'completed',
      is_estimate: false,
    }, {
      assignment_id: 24,
      request_id: 14,
      project_id: 13,
      project_title: 'moon',
      company_name: 'Black Company',
      total_agreed_price_iqd: 20,
      commission_rate: 0.05,
      commission_fee_iqd: 1,
      status: 'completed',
      is_estimate: false,
    }, {
      assignment_id: 6,
      request_id: 4,
      project_id: 6,
      project_title: 'new project',
      company_name: 'Black Company',
      total_agreed_price_iqd: 19,
      commission_rate: 0.05,
      commission_fee_iqd: 1,
      status: 'completed',
      is_estimate: false,
    }, {
      assignment_id: null,
      request_id: null,
      project_id: 3,
      project_title: 'Commercial Solar Installation',
      company_name: 'Tigris Energy Works',
      total_agreed_price_iqd: 64_000_000,
      commission_rate: 0.05,
      commission_fee_iqd: 3_200_000,
      status: 'completed',
      is_estimate: true,
    }]);
    vi.mocked(api.adminPolicyReports).mockResolvedValue([{
      id: 3,
      subject: 'Inappropriate chat message',
      description: 'A user reported a message for review.',
      status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }]);
    vi.mocked(api.adminVerificationDocument).mockResolvedValue({
      company_id: 4,
      document_type: 'license',
      file_name: 'license.png',
      content_type: 'image/png',
      data_base64: 'iVBORw0KGgo=',
    });
    vi.mocked(api.updatePolicyReportStatus).mockResolvedValue({
      id: 3,
      subject: 'Inappropriate chat message',
      description: 'A user reported a message for review.',
      status: 'resolved',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    });
    vi.mocked(api.refundDepositPayment).mockResolvedValue({
      transaction_id: 'UTU-TEST-123',
      payment_method: 'fib',
      total_iqd: 10_000_000,
      deposit_iqd: 500_000,
      remaining_iqd: 9_500_000,
      commission_iqd: 500_000,
      payment_status: 'refunded',
      commission_status: 'reversed',
      project_status: 'cancelled',
      created_at: '2026-01-01T00:00:00Z',
      refunded_at: '2026-01-02T00:00:00Z',
    });
    render(
      <LanguageProvider>
        <AuthProvider>
          <CompanyPortalPage />
        </AuthProvider>
      </LanguageProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Platform administration' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Load applications' })).toBeInTheDocument();
    expect(screen.getByText(/no separate secret token is needed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load applications' }));

    await screen.findByRole('button', { name: 'Approve Verification' });
    expect(screen.getAllByRole('button', { name: 'Approve Verification' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Approve Identity \/ Office/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Highlight as Featured on Homepage')).not.toBeInTheDocument();
    expect(api.adminPendingCompanies).toHaveBeenCalledWith();
    expect(api.listAdminLifecycle).toHaveBeenCalledWith();
    expect(screen.getByRole('tab', { name: 'Verification Applications' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Clients & Projects Sector/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Clients & Projects Sector/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Projects Management' }));
    expect(await screen.findByRole('heading', { name: 'Commission & Platform Revenue' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Project status/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active & Pending Approval Projects' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Verify & Mark as Completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject / Request Changes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View contract document' }));
    expect(await screen.findByRole('dialog', { name: 'وثيقة عقد اتفاق وتجهيز منظومة شمسية' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    fireEvent.click(screen.getByRole('button', { name: 'View Uploaded Completion Photo' }));
    expect(await screen.findByRole('dialog', { name: 'Completion proof photo' })).toBeInTheDocument();
    expect(api.getAdminCompletionProof).toHaveBeenCalledWith(pendingLifecycle.assignment_id);
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Mark as Completed' }));
    await waitFor(() => expect(api.reviewProjectLifecycle).toHaveBeenCalledWith(17, 'approved', ''));
    fireEvent.click(screen.getByRole('tab', { name: 'Verified & Completed Projects Portfolio' }));
    expect(screen.getByRole('tab', { name: 'Verified & Completed Projects Portfolio' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Highlight as Featured on Homepage')).not.toBeInTheDocument();
    expect(screen.getByText('10,000,000 IQD')).toBeInTheDocument();
    expect(screen.getAllByText('500,000 IQD')).toHaveLength(2);
    expect(screen.getByText('UTU-TEST-123')).toBeInTheDocument();
    expect(screen.getByText('Demo deposit — nothing collected')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Refund deposit' })[0]);
    await waitFor(() => expect(api.refundDepositPayment).toHaveBeenCalledWith(5));
    expect((await screen.findAllByText('Refunded')).length).toBeGreaterThan(0);
    expect(screen.getByText('starlink111')).toBeInTheDocument();
    expect(screen.getByText('moon')).toBeInTheDocument();
    expect(screen.getByText('new project')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Policy Reports & Chat Violations' })).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Companies Sector/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Verification Applications' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'View Document' })[0]);
    expect(await screen.findByRole('dialog', { name: 'license.png' })).toBeInTheDocument();
    expect(api.adminVerificationDocument).toHaveBeenCalledWith(4, 'license');
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(screen.getByRole('tab', { name: /Clients & Projects Sector/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Projects Management' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('Resolved')).toBeInTheDocument();
    expect(api.updatePolicyReportStatus).toHaveBeenCalledWith(3, 'resolved');
    fireEvent.click(screen.getByRole('tab', { name: /Companies Sector/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Verification Applications' }));
    expect(screen.getByRole('button', { name: 'Approve Verification' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Identity / office document reviewed'));
    expect(screen.getByRole('button', { name: 'Approve Verification' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Official business register reviewed'));
    fireEvent.click(screen.getByLabelText('Completed-project evidence reviewed'));
    expect(screen.getByRole('button', { name: 'Approve Verification' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve Verification' }));
    await waitFor(() => expect(api.reviewCompany).toHaveBeenCalledWith(4, expect.objectContaining({
      decision: 'verified',
      identity_document_checked: true,
      business_document_checked: true,
      project_evidence_checked: true,
    }), 'admin-jwt'));
  });

  it('prompts the administrator to sign in again when the approval session expires', async () => {
    localStorage.clear();
    const admin: AuthUser = {
      id: 1,
      email: 'admin@example.com',
      phone: null,
      full_name: 'Platform Admin',
      role: 'admin',
      is_active: true,
      is_verified: true,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem(AUTH_TOKEN_KEY, 'admin-jwt');
    vi.mocked(api.authMe).mockReset()
      .mockResolvedValueOnce(admin)
      .mockRejectedValueOnce(new ApiError('Could not validate credentials', 401));
    vi.mocked(api.adminPendingCompanies).mockResolvedValue([pendingCompany]);
    vi.mocked(api.listProjects).mockResolvedValue([]);
    vi.mocked(api.listAdminLifecycle).mockResolvedValue([]);
    vi.mocked(api.adminRevenue).mockResolvedValue([]);
    vi.mocked(api.adminPolicyReports).mockResolvedValue([]);
    vi.mocked(api.reviewCompany).mockReset()
      .mockRejectedValue(new ApiError('Could not validate credentials', 401));
    render(
      <LanguageProvider>
        <AuthProvider>
          <>
            <CompanyPortalPage />
            <AuthModal />
          </>
        </AuthProvider>
      </LanguageProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load applications' }));
    fireEvent.click(await screen.findByLabelText('Identity / office document reviewed'));
    fireEvent.click(screen.getByLabelText('Official business register reviewed'));
    fireEvent.click(screen.getByLabelText('Completed-project evidence reviewed'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve Verification' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your admin session expired. Sign in again to continue.');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it('shows an empty state instead of sample reports when the database has no reports', async () => {
    localStorage.clear();
    const admin: AuthUser = {
      id: 1,
      email: 'admin@example.com',
      phone: null,
      full_name: 'Platform Admin',
      role: 'admin',
      is_active: true,
      is_verified: true,
      company_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem(AUTH_TOKEN_KEY, 'admin-jwt');
    vi.mocked(api.authMe).mockResolvedValue(admin);
    vi.mocked(api.adminPendingCompanies).mockResolvedValue([]);
    vi.mocked(api.adminAllCompanies).mockResolvedValue([]);
    vi.mocked(api.adminUsers).mockResolvedValue([]);
    vi.mocked(api.adminReviews).mockResolvedValue([]);
    vi.mocked(api.listProjects).mockResolvedValue([]);
    vi.mocked(api.listAdminLifecycle).mockResolvedValue([]);
    vi.mocked(api.adminRevenue).mockResolvedValue([]);
    vi.mocked(api.adminPolicyReports).mockResolvedValue([]);
    render(
      <LanguageProvider>
        <AuthProvider>
          <CompanyPortalPage />
        </AuthProvider>
      </LanguageProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load applications' }));
    fireEvent.click(await screen.findByRole('tab', { name: /Clients & Projects Sector/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Projects Management' }));
    expect(await screen.findByText('No policy reports or chat violations have been reported.')).toBeInTheDocument();
    expect(screen.queryByText('Attempted phone number sharing in chat')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });
});

describe('CompanyPortalPage quote marketplace', () => {
  afterEach(() => localStorage.clear());

  function renderCompanyPortal(profile = verifiedCompany, inbox = [assignedRequest]) {
    window.location.hash = '#/company';
    localStorage.setItem(AUTH_TOKEN_KEY, 'company-jwt');
    vi.mocked(api.authMe).mockResolvedValue(companyUser);
    vi.mocked(api.companyProfile).mockResolvedValue(profile);
    vi.mocked(api.companyInbox).mockResolvedValue(inbox);
    return render(
      <LanguageProvider>
        <AuthProvider>
          <CompanyPortalPage />
        </AuthProvider>
      </LanguageProvider>,
    );
  }

  it('keeps customer requests closed until the company is identity verified', async () => {
    vi.mocked(api.companyInbox).mockClear();
    vi.mocked(api.companyInbox).mockResolvedValue([assignedRequest]);
    renderCompanyPortal({ ...pendingCompany, verification_status: 'pending' });

    await waitFor(() => expect(api.companyProfile).toHaveBeenCalled());
    expect(api.companyInbox).not.toHaveBeenCalled();
    expect(screen.queryByText('UTU-2026-COMPANY-TEST')).not.toBeInTheDocument();
    expect(screen.queryByText(/07711111111/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send quote' })).not.toBeInTheDocument();
  });

  it('hides the customer phone until a deposit and locks an accepted quote', async () => {
    renderCompanyPortal(verifiedCompany, [{
      ...assignedRequest,
      customer_phone: null,
      status: 'accepted',
      companies: [{ ...assignedRequest.companies[0], status: 'selected' }],
    }]);

    expect(await screen.findByText('Phone shown after the customer pays the deposit')).toBeInTheDocument();
    expect(screen.queryByText(/07711111111/)).not.toBeInTheDocument();
    expect(screen.getByText('The customer accepted your quote, so the price and terms can no longer be changed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send quote' })).not.toBeInTheDocument();
  });

  it('lets the company sign a deposited contract before work authorization', async () => {
    const selectedRequest: CompanyPortalRequest = {
      ...assignedRequest,
      status: 'accepted',
      companies: [{
        ...assignedRequest.companies[0],
        status: 'selected',
        lifecycle_status: 'awaiting_signatures',
        payment: {
          transaction_id: 'UTU-DEPOSIT-1',
          payment_method: 'fib',
          total_iqd: 10_000_000,
          deposit_iqd: 500_000,
          remaining_iqd: 9_500_000,
          commission_iqd: 500_000,
          payment_status: 'simulated',
          commission_status: 'simulated',
          project_status: 'in_progress',
          created_at: '2026-10-08T00:00:00Z',
          refunded_at: null,
        },
        contract: {
          contract_id: 'UTU-2026-COMPANY-TEST-1',
          customer_name: 'Test Customer',
          company_name: 'Sun Company',
          specifications: {
            system_kwp: 8.4,
            battery_kwh: 10,
            panel_count: 12,
            governorate: 'Baghdad',
            district: 'Al-Jadriya',
          },
          price_iqd: 10_000_000,
          installation_terms: { install_days: 5, warranty: '5 years' },
          signatures: {
            customer: 'بانتظار توقيع الطرف الثاني',
            company: 'بانتظار توقيع الطرف الأول',
            platform_stamp: 'UTU DIGITAL AGREEMENT — DEMONSTRATION',
            customer_signed: false,
            company_signed: false,
          },
        },
      }],
    };
    vi.mocked(api.signCompanyContract).mockResolvedValue({
      lifecycle_status: 'awaiting_admin_approval',
      customer_contract_signed: true,
      company_contract_signed: true,
    });
    renderCompanyPortal(verifiedCompany, [selectedRequest]);

    fireEvent.click(await screen.findByRole('button', { name: 'Sign & Submit Contract to Admin' }));

    await waitFor(() => expect(api.signCompanyContract).toHaveBeenCalledWith(
      'company-jwt',
      selectedRequest.group_id,
      4,
    ));
    expect(await screen.findByText('Both parties signed; awaiting admin work authorization.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit Completion Request to Admin' })).not.toBeInTheDocument();
  });

  it('shows a deposit confirmation and transaction details in the company request inbox', async () => {
    const paidRequest: CompanyPortalRequest = {
      ...assignedRequest,
      status: 'in_progress',
      companies: [{
        ...assignedRequest.companies[0],
        status: 'selected',
        payment: {
          transaction_id: 'UTU-COMPANY-123',
          payment_method: 'zaincash',
          total_iqd: 2_000_000,
          deposit_iqd: 100_000,
          remaining_iqd: 1_900_000,
          commission_iqd: 100_000,
          payment_status: 'simulated',
          commission_status: 'simulated',
          project_status: 'in_progress',
          created_at: '2026-01-01T00:00:00Z',
          refunded_at: null,
        },
      }],
    };
    renderCompanyPortal(verifiedCompany, [paidRequest]);

    expect(await screen.findByText(
      'Deposit confirmed and contact details unlocked. Work still requires both signatures and admin approval.',
    )).toBeInTheDocument();
    expect(screen.getByText(/UTU-COMPANY-123/)).toBeInTheDocument();
    expect(screen.getByText(/100,000 IQD/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send quote' })).not.toBeInTheDocument();
  });

  it('shows request specifications, filters the inbox, and submits a matching itemized quote', async () => {
    vi.mocked(api.chatMessages).mockResolvedValue([]);
    vi.mocked(api.submitCompanyQuote).mockResolvedValue({
      total_iqd: 1000,
      panel_iqd: 100,
      inverter_iqd: 200,
      battery_iqd: 300,
      installation_iqd: 400,
      capacity_kwp: 8.4,
      panel_brand: 'Panel Co',
      inverter_brand: 'Inverter Co',
      battery_brand: 'Battery Co',
      warranty: '10 years',
      install_days: 5,
      financing: false,
      down_payment_iqd: 200,
      installment_months: 3,
      monthly_installment_iqd: 267,
      valid_days: 14,
      notes: '',
    });
    renderCompanyPortal();

    expect(await screen.findByText('Include installation')).toBeInTheDocument();
    expect(screen.getByText(/Baghdad.*Al-Jadriya/)).toBeInTheDocument();
    expect(screen.getByText('Green Initiative / مبادرة خضراء')).toBeInTheDocument();
    expect(screen.getByText('12,000,000 IQD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
    await waitFor(() => expect(api.chatMessages).toHaveBeenCalledWith(
      assignedRequest.group_id,
      4,
      undefined,
      'company-jwt',
    ));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Basra' } });
    expect(screen.getByText('No requests match these filters.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Total price in IQD'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('Solar panels cost (IQD)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Inverter cost (IQD)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Battery cost (IQD)'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Installation and commissioning cost (IQD)'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Panel brand'), { target: { value: 'Panel Co' } });
    fireEvent.change(screen.getByLabelText('Inverter brand'), { target: { value: 'Inverter Co' } });
    fireEvent.change(screen.getByLabelText('Battery brand'), { target: { value: 'Battery Co' } });
    fireEvent.change(screen.getByLabelText('Warranty terms'), { target: { value: '10 years' } });
    fireEvent.change(screen.getByLabelText('Installation days'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Financing available' }));
    fireEvent.change(screen.getByLabelText('Down Payment (IQD)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Repayment Period'), { target: { value: '3' } });
    expect(screen.getByLabelText('Monthly Installment (IQD)')).toHaveValue(266);
    fireEvent.change(screen.getByLabelText('Monthly Installment (IQD)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use calculated installment' }));
    expect(screen.getByLabelText('Monthly Installment (IQD)')).toHaveValue(266);
    fireEvent.change(screen.getByLabelText('Monthly Installment (IQD)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Supports Green Initiative documentation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send quote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The total price must equal the sum of the itemized costs.');
    expect(api.submitCompanyQuote).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Total price in IQD'), { target: { value: '1000' } });
    expect(screen.getByLabelText('Monthly Installment (IQD)')).toHaveValue(267);
    fireEvent.change(screen.getByLabelText('Monthly Installment (IQD)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send quote' }));
    await waitFor(() => expect(api.submitCompanyQuote).toHaveBeenCalledWith(
      'company-jwt',
      assignedRequest.group_id,
      4,
      expect.objectContaining({
        total_iqd: 1000,
        panel_iqd: 100,
        inverter_iqd: 200,
        battery_iqd: 300,
        installation_iqd: 400,
        financing: true,
        down_payment_iqd: 200,
        installment_months: 3,
        monthly_installment_iqd: 300,
        green_initiative_supported: true,
      }),
    ));
    expect(await screen.findByText('Quote saved and sent to the customer.')).toBeInTheDocument();
    expect(await screen.findByText('Quote sent. Wait for the customer to accept your offer before recording the installation as complete.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Project title')).not.toBeInTheDocument();
  });

  it('saves editable company profile fields without changing verification status', async () => {
    vi.mocked(api.updateCompanyProfileContacts).mockResolvedValue({
      phone: '07799999999',
      support_phone: '6060',
    });
    renderCompanyPortal({ ...verifiedCompany, phone: '07700000000', support_phone: '07711111111' });

    const primaryPhoneInput = await screen.findByLabelText('Primary Mobile');
    const supportPhoneInput = screen.getByLabelText('Support / Call Center Phone (Optional)');
    await waitFor(() => {
      expect(primaryPhoneInput).toHaveValue('07700000000');
      expect(supportPhoneInput).toHaveValue('07711111111');
    });
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Updated Sun Company' } });
    fireEvent.change(screen.getByLabelText('Year founded'), { target: { value: '2018' } });
    fireEvent.change(screen.getByLabelText(/Primary headquarters/), { target: { value: 'Erbil' } });
    expect(screen.queryByLabelText('Business license number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tax registration number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Official Business Register / License Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tax Registration Certificate Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Proof of completed projects Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-submit Verification Request' })).not.toBeInTheDocument();
    fireEvent.change(primaryPhoneInput, { target: { value: '07799999999' } });
    fireEvent.change(supportPhoneInput, { target: { value: '6060' } });
    expect(supportPhoneInput).toBeValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save company profile' }));

    await waitFor(() => expect(api.updateCompanyProfileContacts).toHaveBeenCalledWith(
      'company-jwt',
      {
        name: 'Updated Sun Company',
        founded_year: 2018,
        address: 'Erbil',
        phone: '07799999999',
        support_phone: '6060',
      },
    ));
    expect(await screen.findByText('Company profile saved.')).toBeInTheDocument();
    expect(screen.getByText(/Company verification complete/)).toBeInTheDocument();
    expect(screen.getByLabelText('Total price in IQD')).toBeInTheDocument();
  });

  it('adds, removes, and saves additional company branches', async () => {
    const branches = [
      { governorate: 'Basra', address: 'Al-Ashar' },
      { governorate: 'Erbil', address: 'Ankawa' },
    ];
    vi.mocked(api.updateCompanyBranches).mockResolvedValue(branches);
    renderCompanyPortal(verifiedCompany);

    const branchSection = await screen.findByRole('region', { name: 'Additional Branches' });
    fireEvent.change(within(branchSection).getByLabelText('Governorate'), { target: { value: 'Basra' } });
    fireEvent.change(within(branchSection).getByLabelText('Area / address'), { target: { value: 'Al-Ashar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }));
    expect(screen.getByText('Basra · Al-Ashar')).toBeInTheDocument();

    fireEvent.change(within(branchSection).getByLabelText('Governorate'), { target: { value: 'Erbil' } });
    fireEvent.change(within(branchSection).getByLabelText('Area / address'), { target: { value: 'Ankawa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }));
    expect(screen.getByText('Erbil · Ankawa')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove branch' })[0]);
    expect(screen.queryByText('Basra · Al-Ashar')).not.toBeInTheDocument();

    fireEvent.change(within(branchSection).getByLabelText('Governorate'), { target: { value: 'Basra' } });
    fireEvent.change(within(branchSection).getByLabelText('Area / address'), { target: { value: 'Al-Ashar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save branches' }));

    await waitFor(() => expect(api.updateCompanyBranches).toHaveBeenCalledWith(
      'company-jwt',
      [branches[1], branches[0]],
    ));
    expect(await screen.findByText('Additional branches saved.')).toBeInTheDocument();
  });

  it.each(['verified', 'complete'])('shows only the success verification notice for %s companies', async (verification_status) => {
    renderCompanyPortal({ ...verifiedCompany, verification_status });

    expect(await screen.findByText('Your company verification is complete.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Identity or office document Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Official Business Register / License Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tax Registration Certificate Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Proof of completed projects Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-submit Verification Request' })).not.toBeInTheDocument();
    expect(screen.queryByText('Uploaded verification documents')).not.toBeInTheDocument();
  });

  it('shows only the admin-review notice while verification is pending', async () => {
    renderCompanyPortal(pendingCompany);

    expect(await screen.findByText('Your verification request is currently under Admin review.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Identity or office document Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Official Business Register / License Attach PDF or image (3 MB maximum)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-submit Verification Request' })).not.toBeInTheDocument();
  });

  it('resubmits verification for a fresh admin review', async () => {
    vi.mocked(api.resubmitCompanyVerification).mockResolvedValue({ verification_status: 'pending' });
    renderCompanyPortal({
      ...pendingCompany,
      verification_status: 'rejected',
      documents: [{
        document_type: 'national_id',
        file_name: 'national-id.png',
        content_type: 'image/png',
      }],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Re-submit Verification Request' }));

    await waitFor(() => expect(api.resubmitCompanyVerification).toHaveBeenCalledWith(
      'company-jwt',
      { projects_count: 0 },
    ));
    expect(await screen.findByText(/Verification status: Pending review/)).toBeInTheDocument();
    expect(screen.getByText('Verification request resubmitted to the admin team.')).toBeInTheDocument();
  });

  it('shows complete RFQ details and saves editable technical dimensions', async () => {
    vi.mocked(api.updateCompanyRequestTechnicalDetails).mockResolvedValue({
      group_id: assignedRequest.group_id,
      details: {
        ...assignedRequest.details,
        roofArea: '140 sqm',
        siteDimensions: '14m x 10m',
      },
    });
    renderCompanyPortal(verifiedCompany, [{
      ...assignedRequest,
      details: {
        ...assignedRequest.details,
        roofArea: '100 sqm',
        siteDimensions: '10m x 10m',
      },
    }]);

    fireEvent.click(await screen.findByRole('button', { name: 'View Project Details' }));
    expect(await screen.findByRole('dialog', { name: `Project Details: ${assignedRequest.group_id}` })).toBeInTheDocument();
    expect(screen.getByText('100 sqm')).toBeInTheDocument();
    expect(screen.getByText('Test Customer')).toBeInTheDocument();
    expect(screen.getByText('Request submitted')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Roof Surface Area'), { target: { value: '140 sqm' } });
    fireEvent.change(screen.getByLabelText('Site Dimensions'), { target: { value: '14m x 10m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save technical updates' }));

    await waitFor(() => expect(api.updateCompanyRequestTechnicalDetails).toHaveBeenCalledWith(
      'company-jwt',
      assignedRequest.group_id,
      { roof_area: '140 sqm', site_dimensions: '14m x 10m' },
    ));
    expect(await screen.findByText('14m x 10m')).toBeInTheDocument();
  });

  it('shows a prominent inline validation message for short installation details', async () => {
    renderCompanyPortal();
    vi.mocked(api.companyInbox).mockResolvedValue([{
      ...assignedRequest,
      status: 'accepted',
      companies: [{
        ...assignedRequest.companies[0],
        status: 'selected',
        lifecycle_status: 'in_progress',
        work_authorized_at: '2026-01-01T00:00:00Z',
        payment: {
          transaction_id: 'UTU-DEPOSIT-1',
          payment_method: 'fib',
          total_iqd: 1000,
          deposit_iqd: 50,
          remaining_iqd: 950,
          commission_iqd: 50,
          payment_status: 'simulated',
          commission_status: 'simulated',
          project_status: 'in_progress',
          created_at: '2026-01-01T00:00:00Z',
          refunded_at: null,
        },
        quote: {
          total_iqd: 1000,
          panel_iqd: 100,
          inverter_iqd: 200,
          battery_iqd: 300,
          installation_iqd: 400,
          capacity_kwp: 8.4,
          panel_brand: 'Panel Co',
          inverter_brand: 'Inverter Co',
          battery_brand: 'Battery Co',
          warranty: '10 years',
          install_days: 5,
          financing: false,
          valid_days: 14,
          notes: '',
        },
      }],
    }]);

    fireEvent.change(await screen.findByLabelText('Project title'), { target: { value: 'light' } });
    fireEvent.change(screen.getByLabelText('Installation type'), { target: { value: 'h' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Completion Request to Admin' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(
      'Enter a project title and installation type with at least 2 characters each.',
    );
    expect(error).toHaveClass('px-4', 'py-3', 'text-body-sm');
    expect(api.completeCompanyInstallation).not.toHaveBeenCalled();
  });

  it('clears the previous verification notice and JWT when signing out', async () => {
    vi.mocked(api.updateCompanyVerification).mockResolvedValue({ verification_status: 'pending' });
    renderCompanyPortal({ ...pendingCompany, verification_status: 'unverified' });

    await screen.findByRole('button', { name: 'Submit verification details' });
    fireEvent.change(screen.getByLabelText('Identity or office document Attach PDF or image (3 MB maximum)'), {
      target: { files: [new File(['%PDF-1.4'], 'identity.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Submit verification details' }));
    expect(await screen.findByText('Verification details sent for admin review.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // The portal shows its own company sign-in screen again.
    expect(await screen.findByRole('tab', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Verification details sent for admin review.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin review' })).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  describe('company sign-in screen', () => {
    const clientUser: AuthUser = {
      ...companyUser,
      id: 9,
      email: 'client@example.com',
      full_name: 'Test Client',
      role: 'client',
      company_id: null,
    };

    function renderSignedOutPortal(hash = '#/company') {
      localStorage.clear();
      window.location.hash = hash;
      return render(
        <LanguageProvider>
          <AuthProvider>
            <CompanyPortalPage />
          </AuthProvider>
        </LanguageProvider>,
      );
    }

    it('shows its own company sign-in form to logged-out visitors', async () => {
      renderSignedOutPortal();
      expect(await screen.findByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Register or sign in as a client' })).toBeInTheDocument();
    });

    it('opens on company registration from #/company?register and creates a company account', async () => {
      vi.mocked(api.authRegisterCompany).mockResolvedValue({
        access_token: 'new-company-jwt',
        token_type: 'bearer',
        user: { ...companyUser, is_verified: false },
      });
      vi.mocked(api.authMe).mockResolvedValue({ ...companyUser, is_verified: false });
      vi.mocked(api.companyProfile).mockResolvedValue(pendingCompany);
      renderSignedOutPortal('#/company?register');

      expect(await screen.findByRole('tab', { name: 'Register your company' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('heading', { name: 'Register your company' }).parentElement?.parentElement)
        .toHaveClass(
          'backdrop-blur-2xl',
          'border-amber-300/25',
          'bg-[linear-gradient(145deg,rgba(148,163,184,0.32),rgba(71,85,105,0.42)_42%,rgba(15,23,42,0.88))]',
        );
      expect(screen.getByLabelText('Company name').parentElement).toHaveClass('!bg-white/[0.06]');
      expect(screen.getByLabelText('Email address').parentElement).toHaveClass('!border-white/10');
      fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Sun Company' } });
      fireEvent.change(screen.getByLabelText('Iraqi Mobile Phone'), { target: { value: '07712345678' } });
      fireEvent.change(screen.getByLabelText(/Company Support Hotline/), { target: { value: '6060' } });
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'sun@example.com' } });
      fireEvent.change(screen.getByLabelText('Password (at least 10 characters)'), { target: { value: 'a-long-company-password' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => expect(api.authRegisterCompany).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Sun Company',
        email: 'sun@example.com',
        phone: '07712345678',
        support_phone: '6060',
      })));
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('new-company-jwt');
    });

    it('turns a client account away without signing it in', async () => {
      vi.mocked(api.authLogin).mockResolvedValue({
        access_token: 'client-jwt',
        token_type: 'bearer',
        user: clientUser,
      });
      renderSignedOutPortal();

      await screen.findByRole('tab', { name: 'Sign in' });
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'client@example.com' } });
      fireEvent.change(screen.getByLabelText('Password (at least 10 characters)'), { target: { value: 'a-long-client-password' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('This is a client account.');
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    });

    it('tells a signed-in client that the portal is for companies', async () => {
      localStorage.setItem(AUTH_TOKEN_KEY, 'client-jwt');
      vi.mocked(api.authMe).mockResolvedValue(clientUser);
      window.location.hash = '#/company';
      render(
        <LanguageProvider>
          <AuthProvider>
            <CompanyPortalPage />
          </AuthProvider>
        </LanguageProvider>,
      );

      expect(await screen.findByText('You are signed in with a client account. The company portal is for company accounts only.')).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(api.companyProfile).not.toHaveBeenCalledWith('client-jwt');
    });
  });

  it('uploads selected verification evidence with the company application', async () => {
    vi.mocked(api.updateCompanyVerification).mockResolvedValue({ verification_status: 'pending' });
    vi.mocked(api.uploadVerificationDocument).mockResolvedValue({
      company_id: 4,
      document_type: 'national_id',
      file_name: 'identity.pdf',
      content_type: 'application/pdf',
      data_base64: 'JVBERi0xLjQ=',
    });
    renderCompanyPortal({ ...pendingCompany, verification_status: 'unverified' });

    const identityFile = new File(['%PDF-1.4'], 'identity.pdf', { type: 'application/pdf' });
    await screen.findByRole('button', { name: 'Submit verification details' });
    fireEvent.change(screen.getByLabelText('Identity or office document Attach PDF or image (3 MB maximum)'), {
      target: { files: [identityFile] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Submit verification details' }));

    await waitFor(() => expect(api.uploadVerificationDocument).toHaveBeenCalledWith(
      'company-jwt',
      'national_id',
      identityFile,
    ));
    expect(await screen.findByText('Verification details sent for admin review.')).toBeInTheDocument();
  });

  it('requires business register, tax certificate, and completed-project files for full verification', async () => {
    vi.mocked(api.updateCompanyVerification).mockResolvedValue({ verification_status: 'identity_verified' });
    vi.mocked(api.uploadVerificationDocument).mockResolvedValue({
      company_id: 4,
      document_type: 'business_register',
      file_name: 'verification.pdf',
      content_type: 'application/pdf',
      data_base64: 'JVBERi0xLjQ=',
    });
    renderCompanyPortal({ ...verifiedCompany, verification_status: 'identity_verified', projects_count: 3 });
    await screen.findByRole('button', { name: 'Submit verification details' });

    const businessRegister = new File(['business'], 'business-register.pdf', { type: 'application/pdf' });
    const projectProof = new File(['project'], 'project-proof.pdf', { type: 'application/pdf' });
    const taxCertificate = new File(['tax'], 'tax-certificate.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Official Business Register / License Attach PDF or image (3 MB maximum)'), {
      target: { files: [businessRegister] },
    });
    fireEvent.change(screen.getByLabelText('Proof of completed projects Attach PDF or image (3 MB maximum)'), {
      target: { files: [projectProof] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Submit verification details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Attach the business register, tax certificate, and proof of at least 3 completed projects.',
    );
    expect(api.uploadVerificationDocument).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Tax Registration Certificate Attach PDF or image (3 MB maximum)'), {
      target: { files: [taxCertificate] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit verification details' }));
    await waitFor(() => {
      expect(api.uploadVerificationDocument).toHaveBeenCalledWith('company-jwt', 'business_register', businessRegister);
      expect(api.uploadVerificationDocument).toHaveBeenCalledWith('company-jwt', 'tax', taxCertificate);
      expect(api.uploadVerificationDocument).toHaveBeenCalledWith('company-jwt', 'project_proof', projectProof);
    });
  });
});