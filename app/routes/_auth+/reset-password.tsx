import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	json,
	redirect,
	type DataFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireAnonymous, resetUserPassword } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { invariant, useIsPending } from '#app/utils/misc.tsx'
import { PasswordAndConfirmPasswordSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type VerifyFunctionArgs } from './verify.tsx'

const resetPasswordUsernameSessionKey = 'resetPasswordUsername'

export async function handleVerification({ submission }: VerifyFunctionArgs) {
	invariant(submission.value, 'submission.value should be defined by now')
	const target = submission.value.target
	const user = await prisma.user.findFirst({
		where: { OR: [{ email: target }, { username: target }] },
		select: { email: true, username: true },
	})
	// we don't want to say the user is not found if the email is not found
	// because that would allow an attacker to check if an email is registered
	if (!user) {
		return json(submission.reject({ fieldError: { code: ['Invalid code'] } }), {
			status: 400,
		})
	}

	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(resetPasswordUsernameSessionKey, user.username)
	return redirect('/reset-password', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}

const ResetPasswordSchema = PasswordAndConfirmPasswordSchema

async function requireResetPasswordUsername(request: Request) {
	await requireAnonymous(request)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const resetPasswordUsername = verifySession.get(
		resetPasswordUsernameSessionKey,
	)
	if (typeof resetPasswordUsername !== 'string' || !resetPasswordUsername) {
		throw redirect('/login')
	}
	return resetPasswordUsername
}

export async function loader({ request }: DataFunctionArgs) {
	const resetPasswordUsername = await requireResetPasswordUsername(request)
	return json({ resetPasswordUsername })
}

export async function action({ request }: DataFunctionArgs) {
	const resetPasswordUsername = await requireResetPasswordUsername(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ResetPasswordSchema,
	})
	if (!submission.value?.password) {
		return json(submission.reject(), {
			status: submission.type === 'submit' ? 400 : 200,
		})
	}
	const { password } = submission.value

	await resetUserPassword({ username: resetPasswordUsername, password })
	const verifySession = await verifySessionStorage.getSession()
	return redirect('/login', {
		headers: {
			'set-cookie': await verifySessionStorage.destroySession(verifySession),
		},
	})
}

export const meta: MetaFunction = () => {
	return [{ title: 'Reset Password | Epic Notes' }]
}

export default function ResetPasswordPage() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const { meta, fields } = useForm({
		id: 'reset-password',
		constraint: getZodConstraint(ResetPasswordSchema),
		lastResult: actionData,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ResetPasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="container flex flex-col justify-center pb-32 pt-20">
			<div className="text-center">
				<h1 className="text-h1">Password Reset</h1>
				<p className="mt-3 text-body-md text-muted-foreground">
					Hi, {data.resetPasswordUsername}. No worries. It happens all the time.
				</p>
			</div>
			<div className="mx-auto mt-16 min-w-full max-w-sm sm:min-w-[368px]">
				<Form method="POST" {...getFormProps(meta)}>
					<Field
						labelProps={{
							htmlFor: fields.password.id,
							children: 'New Password',
						}}
						inputProps={{
							...getInputProps(fields.password, { type: 'password' }),
							autoComplete: 'new-password',
							autoFocus: true,
						}}
						errors={fields.password.errors}
					/>
					<Field
						labelProps={{
							htmlFor: fields.confirmPassword.id,
							children: 'Confirm Password',
						}}
						inputProps={{
							...getInputProps(fields.confirmPassword, { type: 'password' }),
							autoComplete: 'new-password',
						}}
						errors={fields.confirmPassword.errors}
					/>

					<ErrorList errors={meta.errors} id={meta.errorId} />

					<StatusButton
						className="w-full"
						status={isPending ? 'pending' : meta.status ?? 'idle'}
						type="submit"
						disabled={isPending}
					>
						Reset password
					</StatusButton>
				</Form>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
