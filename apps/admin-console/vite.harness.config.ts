import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve(__dirname, '../../../../.artifacts/admin-console-harness');

/** 产物布局归一 —— 与 authenticator / platform-console harness 同因：rollup 对 HTML 入口保留
 *  「相对 root 的路径」（src/harness/index.html），而闸门以产物目录为静态 web root、
 *  对带扩展名请求不回退 SPA，根级缺 index.html 就 404。构建后把 HTML 搬回根级并清掉 src/。 */
function flattenHarnessHtml(outDir: string): Plugin {
	return {
		name: 'harness-html-to-root',
		writeBundle() {
			const from = path.resolve(outDir, 'src/harness/index.html');
			const to = path.resolve(outDir, 'index.html');
			if (fs.existsSync(from)) {
				fs.renameSync(from, to);
				fs.rmSync(path.resolve(outDir, 'src'), { recursive: true, force: true });
			}
		},
	};
}

/** admin 控制台外壳取景框独立构建（第 53 轮）。与 platform-console 的同名文件同构。
 *  产物 = D:\ws\autional-cn\.artifacts\admin-console-harness；生产 main.tsx 不 import 本目录。 */
export default defineConfig({
	root: __dirname,
	plugins: [react(), flattenHarnessHtml(OUT_DIR)],
	resolve: {
		extensions: ['.mjs', '.tsx', '.ts', '.jsx', '.js', '.json'],
		alias: { '@': path.resolve(__dirname, './src') },
	},
	build: {
		outDir: OUT_DIR,
		emptyOutDir: true,
		sourcemap: false,
		rollupOptions: { input: path.resolve(__dirname, 'src/harness/index.html') },
	},
});
