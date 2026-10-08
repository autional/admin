import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import StoragePage from '../app/storage/page';
import BillingPage from '../app/billing/page';
import WalletsPage from '../app/wallets/page';
import PointsPage from '../app/points/page';

import PayChannelsPage from '../app/pay/channels/page';
import PayPaymentsPage from '../app/pay/payments/page';
import PayPaymentDetailPage from '../app/pay/payments/[id]/page';
import PayReconciliationPage from '../app/pay/reconciliation/page';
import PayRefundsPage from '../app/pay/refunds/page';

import WalletListPage from '../app/wallet/list/page';
import WalletAdjustPage from '../app/wallet/adjust/page';
import WalletWithdrawalsPage from '../app/wallet/withdrawals/page';
import WalletDisputesPage from '../app/wallet/disputes/page';
import WalletCouponsPage from '../app/wallet/coupons/page';
import WalletPolicyPage from '../app/wallet/policy/page';
import WalletFraudRulesPage from '../app/wallet/fraud-rules/page';
import WalletEventsPage from '../app/wallet/events/page';

import BillingPlansPage from '../app/billing/plans/page';
import BillingSubscriptionsPage from '../app/billing/subscriptions/page';
import BillingRefundsPage from '../app/billing/refunds/page';
import BillingRevenuePage from '../app/billing/revenue/page';
import BillingDunningPage from '../app/billing/dunning/page';
import BillingTaxExportPage from '../app/billing/tax-export/page';
import BillingAlertsPage from '../app/billing/alerts/page';
import BillingCreditNotesPage from '../app/billing/credit-notes/page';
import BillingCreditBalancePage from '../app/billing/credit-balance/page';

const Admin = ['super_admin', 'admin'] as const;

export const FinanceRoutes = (
	<>
		<Route
			path="storage"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<StoragePage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="wallets"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="points"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<PointsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>

		<Route
			path="pay/channels"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<PayChannelsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="pay/payments"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<PayPaymentsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="pay/payments/:id"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<PayPaymentDetailPage />
				</RequireAuth>
			}
		/>
		<Route
			path="pay/reconciliation"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<PayReconciliationPage />
				</RequireAuth>
			}
		/>
		<Route
			path="pay/refunds"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<PayRefundsPage />
				</RequireAuth>
			}
		/>

		<Route
			path="wallet/list"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletListPage />
				</RequireAuth>
			}
		/>
		<Route
			path="wallet/adjust"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletAdjustPage />
				</RequireAuth>
			}
		/>
		<Route
			path="wallet/withdrawals"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletWithdrawalsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="wallet/disputes"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletDisputesPage />
				</RequireAuth>
			}
		/>
		<Route
			path="wallet/coupons"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletCouponsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="wallet/policy"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletPolicyPage />
				</RequireAuth>
			}
		/>
		<Route
			path="wallet/fraud-rules"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletFraudRulesPage />
				</RequireAuth>
			}
		/>
		<Route
			path="wallet/events"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WalletEventsPage />
				</RequireAuth>
			}
		/>

		{/* A-400③：billing/* 九子路由补本地 ErrorBoundary（与旧 /billing L51-60 同构，崩溃不再全站白屏） */}
		<Route
			path="billing/plans"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingPlansPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/subscriptions"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingSubscriptionsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/refunds"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingRefundsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/revenue"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingRevenuePage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/dunning"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingDunningPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/tax-export"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingTaxExportPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/alerts"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingAlertsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/credit-notes"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingCreditNotesPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="billing/credit-balance"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<BillingCreditBalancePage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
	</>
);
