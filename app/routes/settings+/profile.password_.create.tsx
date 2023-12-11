import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, redirect, type DataFunctionArgs } from '@remix-run/node'
import { Form, Link, useActionData } from '@remix-run/react'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getPasswordHash, requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { PasswordAndConfirmPasswordSchema } from '#app/utils/user-validation.ts'
import { type BreadcrumbHandle } from './profile.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: <Icon name="dots-horizontal">Password</Icon>,
	getSitemapEntries: () => null,
}

const CreatePasswordForm = PasswordAndConfirmPasswordSchema

async function requireNoPassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (password) {
		throw redirect('/settings/profile/password')
	}
}

export async function loader({ request }: DataFunctionArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	return json({})
}

export async function action({ request }: DataFunctionArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		async: true,
		schema: CreatePasswordForm,
	})
	if (!submission.value) {
		return json(
			submission.reject({
				hideFields: ['password', 'confirmPassword'],
			}),
			{
				status: submission.type === 'submit' ? 400 : 200,
			},
		)
	}

	const { password } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			password: {
				create: {
					hash: await getPasswordHash(password),
				},
			},
		},
	})

	return redirect(`/settings/profile`, { status: 302 })
}

export default function CreatePasswordRoute() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const { meta, fields } = useForm({
		id: 'password-create-form',
		constraint: getZodConstraint(CreatePasswordForm),
		lastResult: actionData,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreatePasswordForm })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Form method="POST" {...getFormProps(meta)} className="mx-auto max-w-md">
			<Field
				labelProps={{ children: 'New Password' }}
				inputProps={getInputProps(fields.password, { type: 'password' })}
				errors={fields.password.errors}
			/>
			<Field
				labelProps={{ children: 'Confirm New Password' }}
				inputProps={getInputProps(fields.confirmPassword, {
					type: 'password',
				})}
				errors={fields.confirmPassword.errors}
			/>
			<ErrorList id={meta.errorId} errors={meta.errors} />
			<div className="grid w-full grid-cols-2 gap-6">
				<Button variant="secondary" asChild>
					<Link to="..">Cancel</Link>
				</Button>
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : meta.status ?? 'idle'}
				>
					Create Password
				</StatusButton>
			</div>
		</Form>
	)
}
