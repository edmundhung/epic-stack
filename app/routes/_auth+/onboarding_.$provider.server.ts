import { redirect } from 'react-router'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { onboardingEmailSessionKey } from './onboarding.tsx'
import { type VerifyFunctionArgs } from './verify.server.ts'

export async function handleVerification({ resultData }: VerifyFunctionArgs) {
	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(onboardingEmailSessionKey, resultData.target)
	return redirect('/onboarding', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}
