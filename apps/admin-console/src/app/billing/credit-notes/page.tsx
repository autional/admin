'use client';

import React, { useState } from 'react';
import { Tag, Button, Modal, Form, Input, InputNumber, Space, Card, Descriptions, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import {
	Ban,
	Eye,
	Plus,
	Search,
	Trash2,
} from 'lucide-react';
import {
	useCreateCreditNote,
	useCreditNote,
	useCancelCreditNote,
	useDeleteCreditNote,
	type CreditNoteItem,
} from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';

export default function BillingCreditNotesPage() {
	const { t } = useTranslation();
	usePageTitle(t('creditNotes.title'));
	const [searchNumber, setSearchNumber] = useState('');
	const [lookupNumber, setLookupNumber] = useState('');
	const { data: creditNote, isLoading, error, refetch } = useCreditNote(lookupNumber);
	const createMut = useCreateCreditNote();
	const cancelMut = useCancelCreditNote();
	const deleteMut = useDeleteCreditNote();

	// A-431⑤：404 = 「未找到」（表内空态已表达）≠ 系统错误；后者才弹 PageError
	const notFound = (error as { response?: { status?: number } } | null)?.response?.status === 404;

	// A-431①③：状态标签/配色单点（表格与详情共用；`applied` 为虚构枚举已退场，domain 仅 issued/cancelled）
	const statusColors: Record<string, string> = {
		issued: 'processing',
		cancelled: 'default',
	};
	const statusLabels: Record<string, string> = {
		issued: t('creditNotes.status.issued'),
		cancelled: t('creditNotes.status.cancelled'),
	};
	const renderStatus = (v?: string) =>
		v ? <Tag color={statusColors[v] ?? 'default'}>{statusLabels[v] ?? v}</Tag> : '-';

	// A-431④：amount=0 不因假值判定显 '-'；decimal 经 wire 为字符串（A-434 家族），先转 Number 再本地化
	const renderAmount = (v?: string) =>
		v === undefined || v === null || v === '' ? '-' : Number(v).toLocaleString('zh-CN');

	const [createModal, setCreateModal] = useState(false);
	const [createForm] = Form.useForm();
	const [detailModal, setDetailModal] = useState(false);

	const results = creditNote ? [creditNote] : [];

	const handleCreate = async (values: {
		invoiceNumber: string;
		amount: number;
		reason: string;
	}) => {
		try {
			const result = await createMut.mutateAsync({
				invoiceNumber: values.invoiceNumber,
				data: {
					invoiceNumber: values.invoiceNumber,
					amount: values.amount,
					reason: values.reason || '',
				},
			});
			message.success(t('creditNotes.createSuccess'));
			setCreateModal(false);
			createForm.resetFields();
			if (result?.data?.creditNoteNumber) {
				setSearchNumber(result.data.creditNoteNumber);
				setLookupNumber(result.data.creditNoteNumber);
			}
		} catch (err) {
			handleApiError(err, t('creditNotes.createFailed'));
		}
	};

	const handleCancel = async (number: string) => {
		try {
			await cancelMut.mutateAsync(number);
			message.success(t('creditNotes.cancelSuccess'));
			refetch();
		} catch (err) {
			handleApiError(err, t('creditNotes.cancelFailed'));
		}
	};

	const handleDelete = async (number: string) => {
		try {
			await deleteMut.mutateAsync(number);
			message.success(t('creditNotes.deleteSuccess'));
			setLookupNumber('');
			setSearchNumber('');
		} catch (err) {
			handleApiError(err, t('creditNotes.deleteFailed'));
		}
	};

	const columns = [
		{
			title: t('creditNotes.column.noteNumber'),
			dataIndex: 'creditNoteNumber',
			key: 'creditNoteNumber',
			ellipsis: true,
			width: 160,
		},
		{
			title: t('creditNotes.column.invoiceNumber'),
			dataIndex: 'invoiceNumber',
			key: 'invoiceNumber',
			width: 160,
			render: (v: string) => v || '-',
		},
		{
			title: t('creditNotes.column.amount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 100,
			render: (v: string) => renderAmount(v),
		},
		{
			title: t('creditNotes.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => renderStatus(v),
		},
		{
			title: t('creditNotes.column.issuedAt'),
			dataIndex: 'issuedAt',
			key: 'issuedAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
		},
		{
			title: t('creditNotes.column.actions'),
			key: 'action',
			width: 200,
			render: (_: unknown, record: CreditNoteItem) => (
				<Space size="small">
					<Button
						type="link"
						size="small"
						icon={<Eye size="1em" />}
						onClick={() => {
							setDetailModal(true);
						}}
					>
						{t('creditNotes.detail')}
					</Button>
					{record.status === 'issued' && (
						<Popconfirm
							title={t('creditNotes.confirmCancel')}
							onConfirm={() => handleCancel(record.creditNoteNumber!)}
							okText={t('creditNotes.confirm')}
							cancelText={t('creditNotes.cancel')}
						>
							<Button type="link" size="small" danger icon={<Ban size="1em" />}>
								{t('creditNotes.cancel')}
							</Button>
						</Popconfirm>
					)}
					{/* A-430：删除须先取消（服务端 IsTerminal 守卫 "must be cancelled first"）→ 非 cancelled 置灰 */}
					<Popconfirm
						title={t('creditNotes.confirmDelete')}
						onConfirm={() => handleDelete(record.creditNoteNumber!)}
						okText={t('creditNotes.confirm')}
						cancelText={t('creditNotes.cancel')}
						disabled={record.status !== 'cancelled'}
					>
						<Button
							type="link"
							size="small"
							danger
							icon={<Trash2 size="1em" />}
							disabled={record.status !== 'cancelled'}
						>
							{t('creditNotes.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('creditNotes.title')}
				actions={
					<>
						<Button type="primary" icon={<Plus size="1em" />} onClick={() => setCreateModal(true)}>
							{t('creditNotes.create')}
						</Button>
					</>
				}
			/>

			{/* A-431⑤：404 由表内空态表达（未找到），不与 PageError 并置 */}
			{error && !notFound && (
				<PageError message={t('creditNotes.queryError')} retry={refetch} className="mb-4" />
			)}

			<Card size="small" className="mb-4">
				<Space wrap>
					<Input
						placeholder={t('creditNotes.searchPlaceholder')}
						value={searchNumber}
						onChange={(e) => setSearchNumber(e.target.value)}
						className="w-60"
						onPressEnter={() => setLookupNumber(searchNumber)}
					/>
					<Button icon={<Search size="1em" />} onClick={() => setLookupNumber(searchNumber)}>
						{t('creditNotes.search')}
					</Button>
					{lookupNumber && (
						<Button
							onClick={() => {
								setLookupNumber('');
								setSearchNumber('');
							}}
						>
							{t('creditNotes.clear')}
						</Button>
					)}
				</Space>
			</Card>

			<DataTable
				rowKey="creditNoteNumber"
				columns={columns}
				dataSource={results}
				loading={isLoading}
				pagination={false}
				locale={{
					emptyText: lookupNumber
						? t('creditNotes.noResult')
						: t('creditNotes.enterNumberToSearch'),
				}}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={t('creditNotes.createTitle')}
				open={createModal}
				onCancel={() => {
					setCreateModal(false);
					createForm.resetFields();
				}}
				onOk={() => createForm.submit()}
				confirmLoading={createMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={createForm} layout="vertical" onFinish={handleCreate}>
					<Form.Item
						name="invoiceNumber"
						label={t('creditNotes.column.invoiceNumber')}
						rules={[{ required: true, message: t('creditNotes.invoiceNumberRequired') }]}
					>
						<Input placeholder={t('creditNotes.invoicePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="amount"
						label={t('creditNotes.column.amount')}
						rules={[{ required: true, message: t('creditNotes.amountRequired') }]}
					>
						<InputNumber
							className="w-full"
							min={0.01}
							step={0.01}
							precision={2}
							placeholder={t('creditNotes.amountPlaceholder')}
						/>
					</Form.Item>
					<Form.Item name="reason" label={t('creditNotes.reason')}>
						<Input.TextArea rows={3} placeholder={t('creditNotes.reasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('creditNotes.detailTitle')}
				open={detailModal}
				onCancel={() => setDetailModal(false)}
				footer={null}
				width={560}
				className="w-full max-w-[560px]"
			>
				{creditNote && (
					<Descriptions column={1} bordered size="small">
						<Descriptions.Item label={t('creditNotes.column.noteNumber')}>
							{creditNote.creditNoteNumber}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.column.invoiceNumber')}>
							{creditNote.invoiceNumber || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.column.amount')}>
							{renderAmount(creditNote.amount)}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.column.status')}>
							{renderStatus(creditNote.status)}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.reason')}>
							{creditNote.reason || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.column.issuedAt')}>
							{creditNote.issuedAt
								? new Date(creditNote.issuedAt).toLocaleString('zh-CN')
								: '-'}
						</Descriptions.Item>
						{/* A-431②：appliedAt 死字段行移除（DTO 声明、domain 无此字段、mapper 不填） */}
					</Descriptions>
				)}
			</Modal>
		</div>
	);
}
