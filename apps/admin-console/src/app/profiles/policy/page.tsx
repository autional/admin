'use client';

import { useState, useEffect } from 'react';
import { Form, InputNumber, Select, Switch, Radio, Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { AppPageHeader, LoadingScreen, SectionCard } from '@autional/ui';
import { apiClient } from '@autional/shared';
import {
	adminProfilesPolicy,
	adminProfilesPolicyPut,
	adminProfilesPolicyDelete,
} from '@autional/shared/generated/api';

export default function ProfilePolicyPage() {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [form] = Form.useForm();

	useEffect(() => {
		adminProfilesPolicy()
			.then((res) => {
				const p = (res as any) ?? null;
				if (p) {
					form.setFieldsValue({
						required_fields: p.requiredFields ?? [],
						max_avatar_size_bytes: p.maxAvatarSizeBytes ?? 0,
						allowed_avatar_types: p.allowedAvatarTypes ?? [],
						max_custom_fields: p.maxCustomFields ?? 0,
						max_tags_per_user: p.maxTagsPerUser ?? 0,
						max_social_links: p.maxSocialLinks ?? 0,
						default_profile_visibility: p.defaultProfileVisibility ?? 'public',
						default_show_email: p.defaultShowEmail ?? false,
						default_show_phone: p.defaultShowPhone ?? false,
						default_show_location: p.defaultShowLocation ?? false,
						auto_archive_after_days: p.autoArchiveAfterDays ?? 0,
						retention_days_after_delete: p.retentionDaysAfterDelete ?? 0,
						avatar_upload_enabled: p.avatarUploadEnabled ?? false,
						tags_enabled: p.tagsEnabled ?? false,
						social_links_enabled: p.socialLinksEnabled ?? false,
						custom_fields_enabled: p.customFieldsEnabled ?? false,
						privacy_impact_enabled: p.privacyImpactEnabled ?? false,
						public_profile_enabled: p.publicProfileEnabled ?? false,
						completeness_enabled: p.completenessEnabled ?? false,
					});
				}
			})
			.catch(() => message.info(t('profilePolicy.noConfig')))
			.finally(() => setLoading(false));
	}, []);

	const handleSave = async (values: any) => {
		setSaving(true);
		try {
			await adminProfilesPolicyPut(values);
			message.success(t('profilePolicy.saveSuccess'));
		} catch (err: any) {
			message.error(err?.message || t('profilePolicy.saveFailed'));
		} finally {
			setSaving(false);
		}
	};

	const handleReset = async () => {
		try {
			await adminProfilesPolicyDelete();
			form.resetFields();
			message.success(t('profilePolicy.resetSuccess'));
		} catch (err: any) {
			message.error(err?.message || t('profilePolicy.resetFailed'));
		}
	};

	if (loading) return <LoadingScreen message={t('profilePolicy.loading')} />;

	return (
		<div>
			<AppPageHeader title={t('profilePolicy.title')} description={t('profilePolicy.subtitle')} />
			<Form form={form} layout="vertical" onFinish={handleSave}>
				<SectionCard title={t('profilePolicy.section.completion')}>
					<Form.Item name="required_fields" label={t('profilePolicy.field.requiredFields')}>
						<Select
							mode="multiple"
							placeholder={t('profilePolicy.field.requiredFieldsPlaceholder')}
							options={[
								{ label: t('profilePolicy.option.firstName'), value: 'first_name' },
								{ label: t('profilePolicy.option.lastName'), value: 'last_name' },
								{ label: t('profilePolicy.option.avatarUrl'), value: 'avatar_url' },
								{ label: t('profilePolicy.option.bio'), value: 'bio' },
								{ label: t('profilePolicy.option.birthDate'), value: 'birth_date' },
								{ label: t('profilePolicy.option.gender'), value: 'gender' },
								{ label: t('profilePolicy.option.country'), value: 'country' },
								{ label: t('profilePolicy.option.city'), value: 'city' },
								{ label: t('profilePolicy.option.website'), value: 'website' },
								{ label: t('profilePolicy.option.socialLinks'), value: 'social_links' },
								{ label: t('profilePolicy.option.customFields'), value: 'custom_fields' },
							]}
						/>
					</Form.Item>
				</SectionCard>
				<SectionCard title={t('profilePolicy.section.mediaLimits')}>
					<Form.Item name="max_avatar_size_bytes" label={t('profilePolicy.field.maxAvatarSize')}>
						<InputNumber className="w-50" placeholder="10485760" />
					</Form.Item>
					<Form.Item
						name="allowed_avatar_types"
						label={t('profilePolicy.field.allowedAvatarTypes')}
					>
						<Select
							mode="multiple"
							placeholder={t('profilePolicy.field.allowedAvatarTypesPlaceholder')}
							options={[
								{ label: t('profilePolicy.option.jpeg'), value: 'image/jpeg' },
								{ label: t('profilePolicy.option.png'), value: 'image/png' },
								{ label: t('profilePolicy.option.gif'), value: 'image/gif' },
								{ label: t('profilePolicy.option.webp'), value: 'image/webp' },
							]}
						/>
					</Form.Item>
				</SectionCard>
				<SectionCard title={t('profilePolicy.section.quantityLimits')}>
					<Form.Item name="max_custom_fields" label={t('profilePolicy.field.maxCustomFields')}>
						<InputNumber className="w-50" />
					</Form.Item>
					<Form.Item name="max_tags_per_user" label={t('profilePolicy.field.maxTagsPerUser')}>
						<InputNumber className="w-50" />
					</Form.Item>
					<Form.Item name="max_social_links" label={t('profilePolicy.field.maxSocialLinks')}>
						<InputNumber className="w-50" />
					</Form.Item>
				</SectionCard>
				<SectionCard title={t('profilePolicy.section.privacyDefaults')}>
					<Form.Item
						name="default_profile_visibility"
						label={t('profilePolicy.field.defaultVisibility')}
					>
						<Radio.Group>
							<Radio value="public">{t('profilePolicy.visibility.public')}</Radio>
							<Radio value="contacts_only">{t('profilePolicy.visibility.contactsOnly')}</Radio>
							<Radio value="private">{t('profilePolicy.visibility.private')}</Radio>
						</Radio.Group>
					</Form.Item>
					<Form.Item
						name="default_show_email"
						label={t('profilePolicy.field.showEmail')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="default_show_phone"
						label={t('profilePolicy.field.showPhone')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="default_show_location"
						label={t('profilePolicy.field.showLocation')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</SectionCard>
				<SectionCard title={t('profilePolicy.section.lifecycle')}>
					<Form.Item
						name="auto_archive_after_days"
						label={t('profilePolicy.field.autoArchiveDays')}
					>
						<InputNumber className="w-50" />
					</Form.Item>
					<Form.Item
						name="retention_days_after_delete"
						label={t('profilePolicy.field.retentionDays')}
					>
						<InputNumber className="w-50" />
					</Form.Item>
				</SectionCard>
				<SectionCard title={t('profilePolicy.section.featureFlags')}>
					<Form.Item
						name="avatar_upload_enabled"
						label={t('profilePolicy.field.avatarUpload')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="tags_enabled"
						label={t('profilePolicy.field.tags')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="social_links_enabled"
						label={t('profilePolicy.field.socialLinks')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="custom_fields_enabled"
						label={t('profilePolicy.field.customFields')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="privacy_impact_enabled"
						label={t('profilePolicy.field.privacyImpact')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="public_profile_enabled"
						label={t('profilePolicy.field.publicProfile')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="completeness_enabled"
						label={t('profilePolicy.field.completeness')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</SectionCard>
				<Space className="mt-4">
					<Button onClick={handleReset}>{t('profilePolicy.resetDefault')}</Button>
					<Button type="primary" htmlType="submit" loading={saving}>
						{t('profilePolicy.save')}
					</Button>
				</Space>
			</Form>
		</div>
	);
}
