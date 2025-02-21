import { invariantResponse } from '@epic-web/invariant'
import { type FileUpload, parseFormData } from '@mjackson/form-data-parser'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { parseSubmission, report, useFormData } from 'conform-react'
import {
	coerceZodFormData,
	getZodConstraint,
	resolveZodResult,
} from 'conform-zod'
import { useState } from 'react'
import { data, redirect, Form, useNavigation } from 'react-router'
import { z } from 'zod'
import { ErrorList, useForm } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { uploadHandler } from '#app/utils/file-uploads.server.ts'
import {
	getUserImgSrc,
	useDoubleCheck,
	useIsPending,
} from '#app/utils/misc.tsx'
import { type Route } from './+types/profile.photo.ts'
import { type BreadcrumbHandle } from './profile.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: <Icon name="avatar">Photo</Icon>,
	getSitemapEntries: () => null,
}

const MAX_SIZE = 1024 * 1024 * 3 // 3MB

const DeleteImageSchema = z.object({
	intent: z.literal('delete'),
})

const NewImageSchema = z.object({
	intent: z.literal('submit'),
	photoFile: z
		.instanceof(File)
		.refine((file) => file.size > 0, 'Image is required')
		.refine(
			(file) => file.size <= MAX_SIZE,
			'Image size must be less than 3MB',
		),
})

const PhotoFormSchema = coerceZodFormData(
	z.discriminatedUnion('intent', [DeleteImageSchema, NewImageSchema]),
)

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			image: { select: { id: true } },
		},
	})
	invariantResponse(user, 'User not found', { status: 404 })
	return { user }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const formData = await parseFormData(
		request,
		{ maxFileSize: MAX_SIZE },
		async (file: FileUpload) => uploadHandler(file),
	)
	const submission = parseSubmission(formData)
	const result = await PhotoFormSchema.transform(async (data) => {
		if (data.intent === 'delete') return { intent: 'delete' }
		if (data.photoFile.size <= 0) return z.NEVER
		return {
			intent: data.intent,
			image: {
				contentType: data.photoFile.type,
				blob: Buffer.from(await data.photoFile.arrayBuffer()),
			},
		}
	}).safeParseAsync(submission.value)

	if (!result.success) {
		return data(
			{ result: report(submission, { error: resolveZodResult(result) }) },
			{ status: 400 },
		)
	}

	const { image, intent } = result.data

	if (intent === 'delete') {
		await prisma.userImage.deleteMany({ where: { userId } })
		throw redirect('/settings/profile')
	}

	await prisma.$transaction(async ($prisma) => {
		await $prisma.userImage.deleteMany({ where: { userId } })
		await $prisma.user.update({
			where: { id: userId },
			data: { image: { create: image } },
		})
	})

	throw redirect('/settings/profile')
}

export default function PhotoRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const doubleCheckDeleteImage = useDoubleCheck()

	const navigation = useNavigation()

	const { form, fields, intent } = useForm({
		id: 'profile-photo',
		constraint: getZodConstraint(PhotoFormSchema),
		lastResult: actionData?.result,
		onValidate(value) {
			return resolveZodResult(PhotoFormSchema.safeParse(value))
		},
	})
	const lastSubmissionIntent = useFormData(form.id, (formData) =>
		formData?.get('intent')?.toString(),
	)

	const isPending = useIsPending()
	const pendingIntent = isPending ? navigation.formData?.get('intent') : null

	const [newImageSrc, setNewImageSrc] = useState<string | null>(null)

	return (
		<div>
			<Form
				method="POST"
				encType="multipart/form-data"
				className="flex flex-col items-center justify-center gap-10"
				onReset={() => setNewImageSrc(null)}
				{...form.props}
			>
				<img
					src={
						newImageSrc ??
						(loaderData.user ? getUserImgSrc(loaderData.user.image?.id) : '')
					}
					className="h-52 w-52 rounded-full object-cover"
					alt={loaderData.user?.name ?? loaderData.user?.username}
				/>
				<ErrorList errors={fields.photoFile.errors} id={fields.photoFile.id} />
				<div className="flex gap-4">
					{/*
						We're doing some kinda odd things to make it so this works well
						without JavaScript. Basically, we're using CSS to ensure the right
						buttons show up based on the input's "valid" state (whether or not
						an image has been selected). Progressive enhancement FTW!
					*/}
					<input
						type="file"
						{...fields.photoFile.props}
						accept="image/*"
						className="peer sr-only"
						required
						tabIndex={newImageSrc ? -1 : 0}
						onChange={(e) => {
							const file = e.currentTarget.files?.[0]
							if (file) {
								const reader = new FileReader()
								reader.onload = (event) => {
									setNewImageSrc(event.target?.result?.toString() ?? null)
								}
								reader.readAsDataURL(file)
							}
						}}
					/>
					<Button
						asChild
						className="cursor-pointer peer-valid:hidden peer-focus-within:ring-2 peer-focus-visible:ring-2"
					>
						<label htmlFor={fields.photoFile.id}>
							<Icon name="pencil-1">Change</Icon>
						</label>
					</Button>
					<StatusButton
						name="intent"
						value="submit"
						type="submit"
						className="peer-invalid:hidden"
						status={
							pendingIntent === 'submit'
								? 'pending'
								: lastSubmissionIntent === 'submit'
									? (form.status ?? 'idle')
									: 'idle'
						}
					>
						Save Photo
					</StatusButton>
					<Button
						variant="destructive"
						className="peer-invalid:hidden"
						type="button"
						onClick={() => intent.reset()}
					>
						<Icon name="trash">Reset</Icon>
					</Button>
					{loaderData.user.image?.id ? (
						<StatusButton
							className="peer-valid:hidden"
							variant="destructive"
							{...doubleCheckDeleteImage.getButtonProps({
								type: 'submit',
								name: 'intent',
								value: 'delete',
							})}
							status={
								pendingIntent === 'delete'
									? 'pending'
									: lastSubmissionIntent === 'delete'
										? (form.status ?? 'idle')
										: 'idle'
							}
						>
							<Icon name="trash">
								{doubleCheckDeleteImage.doubleCheck
									? 'Are you sure?'
									: 'Delete'}
							</Icon>
						</StatusButton>
					) : null}
				</div>
				<ErrorList errors={form.errors} />
			</Form>
		</div>
	)
}
