import { parseSubmission, report, restoreResult } from 'conform-react'
import {
	coerceZodFormData,
	getZodConstraint,
	resolveZodResult,
} from 'conform-zod'
import {
	redirect,
	data,
	type Params,
	Form,
	useSearchParams,
} from 'react-router'
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
import {
	authenticator,
	sessionKey,
	signupWithConnection,
	requireAnonymous,
} from '#app/utils/auth.server.ts'
import { connectionSessionStorage } from '#app/utils/connections.server'
import { ProviderNameSchema } from '#app/utils/connections.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type Route } from './+types/onboarding_.$provider.ts'
import { onboardingEmailSessionKey } from './onboarding'

export const providerIdKey = 'providerId'
export const prefilledProfileKey = 'prefilledProfile'

const SignupFormSchema = coerceZodFormData(
	z.object({
		imageUrl: z.string().optional(),
		username: UsernameSchema,
		name: NameSchema,
		agreeToTermsOfServiceAndPrivacyPolicy: z.boolean({
			required_error:
				'You must agree to the terms of service and privacy policy',
		}),
		remember: z.boolean().optional(),
		redirectTo: z.string().optional(),
	}),
)

async function requireData({
	request,
	params,
}: {
	request: Request
	params: Params
}) {
	await requireAnonymous(request)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const email = verifySession.get(onboardingEmailSessionKey)
	const providerId = verifySession.get(providerIdKey)
	const result = z
		.object({
			email: z.string(),
			providerName: ProviderNameSchema,
			providerId: z.string(),
		})
		.safeParse({ email, providerName: params.provider, providerId })
	if (result.success) {
		return result.data
	} else {
		console.error(result.error)
		throw redirect('/signup')
	}
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const { email } = await requireData({ request, params })
	const connectionSession = await connectionSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const prefilledProfile = verifySession.get(prefilledProfileKey)

	const formError = connectionSession.get(authenticator.sessionErrorKey)
	const hasError = typeof formError === 'string'

	return {
		email,
		status: 'idle',
		initialResult: restoreResult(prefilledProfile, {
			initialError: hasError ? { formErrors: [formError] } : null,
		}),
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const { email, providerId, providerName } = await requireData({
		request,
		params,
	})
	const formData = await request.formData()
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
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
			const session = await signupWithConnection({
				...data,
				email,
				providerId,
				providerName,
			})
			return { ...data, session }
		})
		.safeParseAsync(submission.value)

	if (!result.success) {
		return data(
			{
				result: report(submission, {
					error: resolveZodResult(result),
				}),
			},
			{ status: 400 },
		)
	}

	const { session, remember, redirectTo } = result.data

	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	authSession.set(sessionKey, session.id)
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

export default function OnboardingProviderRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const { form, fields } = useForm({
		id: 'onboarding-provider-form',
		constraint: getZodConstraint(SignupFormSchema),
		lastResult: actionData?.result ?? loaderData.initialResult,
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
					{fields.imageUrl.defaultValue ? (
						<div className="mb-4 flex flex-col items-center justify-center gap-4">
							<img
								src={fields.imageUrl.defaultValue}
								alt="Profile"
								className="h-24 w-24 rounded-full"
							/>
							<p className="text-body-sm text-muted-foreground">
								You can change your photo later
							</p>
							<input
								{...fields.imageUrl.props}
								type="hidden"
								defaultValue={fields.imageUrl.defaultValue}
							/>
						</div>
					) : null}
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

					{redirectTo ? (
						<input type="hidden" name="redirectTo" value={redirectTo} />
					) : null}

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
