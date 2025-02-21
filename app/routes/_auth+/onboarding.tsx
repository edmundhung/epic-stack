import { parseSubmission, report } from 'conform-react'
import {
	coerceZodFormData,
	getZodConstraint,
	resolveZodResult,
} from 'conform-zod'
import { data, redirect, Form, useSearchParams } from 'react-router'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import {
	CheckboxField,
	ErrorList,
	Field,
	useForm,
} from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireAnonymous, sessionKey, signup } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	NameSchema,
	PasswordAndConfirmPasswordSchema,
	UsernameSchema,
} from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type Route } from './+types/onboarding.ts'

export const onboardingEmailSessionKey = 'onboardingEmail'

const SignupFormSchema = coerceZodFormData(
	z
		.object({
			username: UsernameSchema,
			name: NameSchema,
			agreeToTermsOfServiceAndPrivacyPolicy: z.boolean({
				required_error:
					'You must agree to the terms of service and privacy policy',
			}),
			remember: z.boolean().optional(),
			redirectTo: z.string().optional(),
		})
		.and(PasswordAndConfirmPasswordSchema),
)

async function requireOnboardingEmail(request: Request) {
	await requireAnonymous(request)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const email = verifySession.get(onboardingEmailSessionKey)
	if (typeof email !== 'string' || !email) {
		throw redirect('/signup')
	}
	return email
}

export async function loader({ request }: Route.LoaderArgs) {
	const email = await requireOnboardingEmail(request)
	return { email }
}

export async function action({ request }: Route.ActionArgs) {
	const email = await requireOnboardingEmail(request)
	const formData = await request.formData()
	await checkHoneypot(formData)
	const submission = parseSubmission(formData)
	const result = await SignupFormSchema.superRefine(async (data, ctx) => {
		const existingUser = await prisma.user.findUnique({
			where: { username: data.username },
			select: { id: true },
		})
		if (existingUser) {
			ctx.addIssue({
				path: ['username'],
				code: z.ZodIssueCode.custom,
				message: 'A user already exists with this username',
			})
			return
		}
	})
		.transform(async (data) => {
			const session = await signup({ ...data, email })
			return { ...data, session }
		})
		.safeParseAsync(submission.value)

	if (!result.success) {
		return data(
			{ result: report(submission, { error: resolveZodResult(result) }) },
			{ status: 400 },
		)
	}

	const { session, remember, redirectTo } = result.data

	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	authSession.set(sessionKey, session.id)
	const verifySession = await verifySessionStorage.getSession()
	const headers = new Headers()
	headers.append(
		'set-cookie',
		await authSessionStorage.commitSession(authSession, {
			expires: remember ? session.expirationDate : undefined,
		}),
	)
	headers.append(
		'set-cookie',
		await verifySessionStorage.destroySession(verifySession),
	)

	return redirectWithToast(
		safeRedirect(redirectTo),
		{ title: 'Welcome', description: 'Thanks for signing up!' },
		{ headers },
	)
}

export const meta: Route.MetaFunction = () => {
	return [{ title: 'Setup Epic Notes Account' }]
}

export default function OnboardingRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const { form, fields } = useForm({
		id: 'onboarding-form',
		constraint: getZodConstraint(SignupFormSchema),
		defaultValue: { redirectTo },
		lastResult: actionData?.result,
		onValidate(value) {
			return resolveZodResult(SignupFormSchema.safeParse(value))
		},
	})

	return (
		<div className="container flex min-h-full flex-col justify-center pb-32 pt-20">
			<div className="mx-auto w-full max-w-lg">
				<div className="flex flex-col gap-3 text-center">
					<h1 className="text-h1">Welcome aboard {loaderData.email}!</h1>
					<p className="text-body-md text-muted-foreground">
						Please enter your details.
					</p>
				</div>
				<Spacer size="xs" />
				<Form
					method="POST"
					className="mx-auto min-w-full max-w-sm sm:min-w-[368px]"
					{...form.props}
				>
					<HoneypotInputs />
					<Field
						labelProps={{ htmlFor: fields.username.id, children: 'Username' }}
						inputProps={{
							...fields.username.props,
							type: 'text',
							defaultValue: fields.username.defaultValue,
							autoComplete: 'username',
							className: 'lowercase',
						}}
						errors={fields.username.errors}
					/>
					<Field
						labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
						inputProps={{
							...fields.name.props,
							type: 'text',
							defaultValue: fields.name.defaultValue,
							autoComplete: 'name',
						}}
						errors={fields.name.errors}
					/>
					<Field
						labelProps={{ htmlFor: fields.password.id, children: 'Password' }}
						inputProps={{
							...fields.password.props,
							type: 'password',
							defaultValue: fields.password.defaultValue,
							autoComplete: 'new-password',
						}}
						errors={fields.password.errors}
					/>

					<Field
						labelProps={{
							htmlFor: fields.confirmPassword.id,
							children: 'Confirm Password',
						}}
						inputProps={{
							...fields.confirmPassword.props,
							type: 'password',
							defaultValue: fields.confirmPassword.defaultValue,
							autoComplete: 'new-password',
						}}
						errors={fields.confirmPassword.errors}
					/>

					<CheckboxField
						labelProps={{
							htmlFor: fields.agreeToTermsOfServiceAndPrivacyPolicy.id,
							children:
								'Do you agree to our Terms of Service and Privacy Policy?',
						}}
						buttonProps={{
							...fields.agreeToTermsOfServiceAndPrivacyPolicy.props,
							type: 'checkbox',
							defaultChecked:
								fields.agreeToTermsOfServiceAndPrivacyPolicy.defaultValue ===
								'on',
						}}
						errors={fields.agreeToTermsOfServiceAndPrivacyPolicy.errors}
					/>
					<CheckboxField
						labelProps={{
							htmlFor: fields.remember.id,
							children: 'Remember me',
						}}
						buttonProps={{
							...fields.remember.props,
							type: 'checkbox',
							defaultChecked: fields.remember.defaultValue === 'on',
						}}
						errors={fields.remember.errors}
					/>

					<input
						{...fields.redirectTo.props}
						type="hidden"
						defaultValue={fields.redirectTo.defaultValue}
					/>
					<ErrorList errors={form.errors} id={form.errorId} />

					<div className="flex items-center justify-between gap-6">
						<StatusButton
							className="w-full"
							status={isPending ? 'pending' : (form.status ?? 'idle')}
							type="submit"
							disabled={isPending}
						>
							Create an account
						</StatusButton>
					</div>
				</Form>
			</div>
		</div>
	)
}
