import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { parseSubmission, report } from 'conform-react'
import {
	coerceZodFormData,
	getZodConstraint,
	resolveZodResult,
} from 'conform-zod'
import { data, redirect, Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field, useForm } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	getPasswordHash,
	requireUserId,
	verifyUserPassword,
} from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { PasswordSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/profile.password.ts'
import { type BreadcrumbHandle } from './profile.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: <Icon name="dots-horizontal">Password</Icon>,
	getSitemapEntries: () => null,
}

const ChangePasswordForm = coerceZodFormData(
	z
		.object({
			currentPassword: PasswordSchema,
			newPassword: PasswordSchema,
			confirmNewPassword: PasswordSchema,
		})
		.superRefine(({ confirmNewPassword, newPassword }, ctx) => {
			if (confirmNewPassword !== newPassword) {
				ctx.addIssue({
					path: ['confirmNewPassword'],
					code: z.ZodIssueCode.custom,
					message: 'The passwords must match',
				})
			}
		}),
)

async function requirePassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (!password) {
		throw redirect('/settings/profile/password/create')
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	const formData = await request.formData()
	const submission = parseSubmission(formData)
	const result = await ChangePasswordForm.superRefine(
		async ({ currentPassword, newPassword }, ctx) => {
			if (currentPassword && newPassword) {
				const user = await verifyUserPassword({ id: userId }, currentPassword)
				if (!user) {
					ctx.addIssue({
						path: ['currentPassword'],
						code: z.ZodIssueCode.custom,
						message: 'Incorrect password.',
					})
				}
			}
		},
	).safeParseAsync(submission.value)
	if (!result.success) {
		return data(
			{
				result: report(submission, {
					error: resolveZodResult(result),
					hideFields: ['currentPassword', 'newPassword', 'confirmNewPassword'],
				}),
			},
			{ status: 400 },
		)
	}

	const { newPassword } = result.data

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			password: {
				update: {
					hash: await getPasswordHash(newPassword),
				},
			},
		},
	})

	return redirectWithToast(
		`/settings/profile`,
		{
			type: 'success',
			title: 'Password Changed',
			description: 'Your password has been changed.',
		},
		{ status: 302 },
	)
}

export default function ChangePasswordRoute({
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()

	const { form, fields } = useForm({
		id: 'password-change-form',
		constraint: getZodConstraint(ChangePasswordForm),
		lastResult: actionData?.result,
		onValidate(value) {
			return resolveZodResult(ChangePasswordForm.safeParse(value))
		},
	})

	return (
		<Form method="POST" {...form.props} className="mx-auto max-w-md">
			<Field
				labelProps={{ children: 'Current Password' }}
				inputProps={{
					...fields.currentPassword.props,
					type: 'password',
					defaultValue: fields.currentPassword.defaultValue,
					autoComplete: 'current-password',
				}}
				errors={fields.currentPassword.errors}
			/>
			<Field
				labelProps={{ children: 'New Password' }}
				inputProps={{
					...fields.newPassword.props,
					type: 'password',
					defaultValue: fields.newPassword.defaultValue,
					autoComplete: 'new-password',
				}}
				errors={fields.newPassword.errors}
			/>
			<Field
				labelProps={{ children: 'Confirm New Password' }}
				inputProps={{
					...fields.confirmNewPassword.props,
					type: 'password',
					defaultValue: fields.confirmNewPassword.defaultValue,
					autoComplete: 'new-password',
				}}
				errors={fields.confirmNewPassword.errors}
			/>
			<ErrorList id={form.errorId} errors={form.errors} />
			<div className="grid w-full grid-cols-2 gap-6">
				<Button variant="secondary" asChild>
					<Link to="..">Cancel</Link>
				</Button>
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
				>
					Change Password
				</StatusButton>
			</div>
		</Form>
	)
}
