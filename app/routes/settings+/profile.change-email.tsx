import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import * as E from '@react-email/components'
import { json, redirect, type DataFunctionArgs } from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	prepareVerification,
	requireRecentVerification,
	type VerifyFunctionArgs,
} from '#app/routes/_auth+/verify.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { invariant, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { EmailSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type BreadcrumbHandle } from './profile.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: <Icon name="envelope-closed">Change Email</Icon>,
	getSitemapEntries: () => null,
}

const newEmailAddressSessionKey = 'new-email-address'

export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	await requireRecentVerification(request)
	invariant(submission.value, 'submission.value should be defined by now')

	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const newEmail = verifySession.get(newEmailAddressSessionKey)
	if (!newEmail) {
		return json(
			submission.reject({
				formError: [
					'You must submit the code on the same device that requested the email change.',
				],
			}),
			{ status: 400 },
		)
	}
	const preUpdateUser = await prisma.user.findFirstOrThrow({
		select: { email: true },
		where: { id: submission.value.target },
	})
	const user = await prisma.user.update({
		where: { id: submission.value.target },
		select: { id: true, email: true, username: true },
		data: { email: newEmail },
	})

	void sendEmail({
		to: preUpdateUser.email,
		subject: 'Epic Stack email changed',
		react: <EmailChangeNoticeEmail userId={user.id} />,
	})

	return redirectWithToast(
		'/settings/profile',
		{
			title: 'Email Changed',
			type: 'success',
			description: `Your email has been changed to ${user.email}`,
		},
		{
			headers: {
				'set-cookie': await verifySessionStorage.destroySession(verifySession),
			},
		},
	)
}

const ChangeEmailSchema = z.object({
	email: EmailSchema,
})

export async function loader({ request }: DataFunctionArgs) {
	await requireRecentVerification(request)
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	})
	if (!user) {
		const params = new URLSearchParams({ redirectTo: request.url })
		throw redirect(`/login?${params}`)
	}
	return json({ user })
}

export async function action({ request }: DataFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const submission = await parseWithZod(formData, {
		schema: ChangeEmailSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
			})
			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'This email is already in use.',
				})
			}
		}),
		async: true,
	})

	if (!submission.value) {
		return json(submission.reject(), {
			status: submission.type === 'submit' ? 400 : 200,
		})
	}
	const { otp, redirectTo, verifyUrl } = await prepareVerification({
		period: 10 * 60,
		request,
		target: userId,
		type: 'change-email',
	})

	const response = await sendEmail({
		to: submission.value.email,
		subject: `Epic Notes Email Change Verification`,
		react: <EmailChangeEmail verifyUrl={verifyUrl.toString()} otp={otp} />,
	})

	if (response.status === 'success') {
		const verifySession = await verifySessionStorage.getSession()
		verifySession.set(newEmailAddressSessionKey, submission.value.email)
		return redirect(redirectTo.toString(), {
			headers: {
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
		})
	} else {
		return json(submission.reject({ formError: [response.error.message] }), {
			status: 500,
		})
	}
}

export function EmailChangeEmail({
	verifyUrl,
	otp,
}: {
	verifyUrl: string
	otp: string
}) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Epic Notes Email Change</E.Text>
				</h1>
				<p>
					<E.Text>
						Here's your verification code: <strong>{otp}</strong>
					</E.Text>
				</p>
				<p>
					<E.Text>Or click the link:</E.Text>
				</p>
				<E.Link href={verifyUrl}>{verifyUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

export function EmailChangeNoticeEmail({ userId }: { userId: string }) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Your Epic Notes email has been changed</E.Text>
				</h1>
				<p>
					<E.Text>
						We're writing to let you know that your Epic Notes email has been
						changed.
					</E.Text>
				</p>
				<p>
					<E.Text>
						If you changed your email address, then you can safely ignore this.
						But if you did not change your email address, then please contact
						support immediately.
					</E.Text>
				</p>
				<p>
					<E.Text>Your Account ID: {userId}</E.Text>
				</p>
			</E.Container>
		</E.Html>
	)
}

export default function ChangeEmailIndex() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()

	const {meta, fields} = useForm({
		id: 'change-email-form',
		constraint: getZodConstraint(ChangeEmailSchema),
		lastResult: actionData,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ChangeEmailSchema })
		},
	})

	const isPending = useIsPending()
	return (
		<div>
			<h1 className="text-h1">Change Email</h1>
			<p>You will receive an email at the new email address to confirm.</p>
			<p>
				An email notice will also be sent to your old address {data.user.email}.
			</p>
			<div className="mx-auto mt-5 max-w-sm">
				<Form method="POST" {...getFormProps(meta)}>
					<AuthenticityTokenInput />
					<Field
						labelProps={{ children: 'New Email' }}
						inputProps={getInputProps(fields.email)}
						errors={fields.email.errors}
					/>
					<ErrorList id={meta.errorId} errors={meta.errors} />
					<div>
						<StatusButton
							status={isPending ? 'pending' : meta.status ?? 'idle'}
						>
							Send Confirmation
						</StatusButton>
					</div>
				</Form>
			</div>
		</div>
	)
}
