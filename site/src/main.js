import './style.css'

document.addEventListener('DOMContentLoaded', () => {
	const copyBtn = document.getElementById('copy-btn')
	const installCmd = document.getElementById('install-cmd')

	if (copyBtn && installCmd) {
		copyBtn.addEventListener('click', async () => {
			const textToCopy = installCmd.textContent.trim()
			try {
				await navigator.clipboard.writeText(textToCopy)
				const copyText = copyBtn.querySelector('.copy-text')
				const originalText = copyText.textContent

				copyBtn.classList.add('copied')
				copyText.textContent = 'Copied!'

				setTimeout(() => {
					copyBtn.classList.remove('copied')
					copyText.textContent = originalText
				}, 2000)
			} catch {
				prompt('Copy to clipboard: Ctrl+C, Enter', textToCopy)
			}
		})
	}

	const tabButtons = document.querySelectorAll('.tab-btn')
	const tabContents = document.querySelectorAll('.tab-content')

	tabButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			const targetId = `tab-${btn.dataset.tab}`

			tabButtons.forEach((b) => {
				b.classList.remove('active')
			})
			tabContents.forEach((c) => {
				c.classList.remove('active')
			})

			btn.classList.add('active')
			const targetContent = document.getElementById(targetId)
			if (targetContent) {
				targetContent.classList.add('active')
			}
		})
	})
})
