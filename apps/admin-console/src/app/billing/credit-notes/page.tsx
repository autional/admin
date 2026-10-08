'use client';

import React, { useState } from 'react';
import { Tag, Button, Modal, Form, Input, InputNumber, Space, Card, Descriptions, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import {
	PlusOutlined,
	SearchOutlined,
	StopOutlined,
	DeleteOutlined,
	EyeOutlined,
} from '@ant-design/icons';
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

export default function BillingCreditNotesPage() {
	const { t } = useTranslation();
	const [searchNumber, setSearchNumber] = useState('');
	const [lookupNumber, setLookupNumber] = useState('');
	const { data: creditNote, isLoading, error, refetch } = useCreditNote(lookupNumber);
	const createMut = useCreateCreditNote();
	const cancelMut = useCancelCreditNote();
	const deleteMut = useDeleteCreditNote();

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
			render: (v: number) => (v ? `${v.toLocaleString()}` : '-'),
		},
		{
			title: t('creditNotes.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					issued: 'processing',
					cancelled: 'default',
					applied: 'success',
				};
				const labelMap: Record<string, string> = {
					issued: t('creditNotes.status.issued'),
					cancelled: t('creditNotes.status.cancelled'),
					applied: t('creditNotes.status.applied'),
				};
				return <Tag color={colorMap[v] ?? 'default'}>{labelMap[v] ?? v}</Tag>;
			},
		},
		{
			title: t('creditNotes.column.issuedAt'),
			dataIndex: 'issuedAt',
			key: 'issuedAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
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
						icon={<EyeOutlined />}
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
							<Button type="link" size="small" danger icon={<StopOutlined />}>
								{t('creditNotes.cancel')}
							</Button>
						</Popconfirm>
					)}
					<Popconfirm
						title={t('creditNotes.confirmDelete')}
						onConfirm={() => handleDelete(record.creditNoteNumber!)}
						okText={t('creditNotes.confirm')}
						cancelText={t('creditNotes.cancel')}
					>
						<Button type="link" size="small" danger icon={<DeleteOutlined />}>
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
						<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>
							{t('creditNotes.create')}
						</Button>
					</>
				}
			/>

			{error && (
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
					<Button icon={<SearchOutlined />} onClick={() => setLookupNumber(searchNumber)}>
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
							{creditNote.amount?.toLocaleString() ?? '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.column.status')}>
							<Tag
								color={
									creditNote.status === 'issued'
										? 'processing'
										: creditNote.status === 'cancelled'
											? 'default'
											: 'success'
								}
							>
								{creditNote.status}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.reason')}>
							{creditNote.reason || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.column.issuedAt')}>
							{creditNote.issuedAt ? new Date(creditNote.issuedAt).toLocaleString() : '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('creditNotes.appliedAt')}>
							{creditNote.appliedAt ? new Date(creditNote.appliedAt).toLocaleString() : '-'}
						</Descriptions.Item>
					</Descriptions>
				)}
			</Modal>
		</div>
	);
}
