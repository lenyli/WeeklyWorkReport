# 研发部工作周报管理平台 (WeeklyWorkReport)

> 基于纯前端技术打造的轻量级研发团队工作周报本地填写、管理与 Excel 汇总导出工具。

[![PWA Offline Ready](https://img.shields.io/badge/PWA-Offline%20Ready-orange.svg)](https://lenyli.github.io/WeeklyWorkReport/)
[![Zero Backend](https://img.shields.io/badge/Backend-None%20(Local%20IndexedDB)-green.svg)](https://lenyli.github.io/WeeklyWorkReport/)

## 项目简介

**WeeklyWorkReport (WWR)** 是一套用于研发团队周报日常填报与汇总统计的轻量纯静态 Web 应用。该应用通过单浏览器本地存储（IndexedDB + localStorage）实现周报流转，无需搭建后端服务器或云端数据库。

本应用适用于内部演示、离线周报起草、或小型团队/个人本地管理每周工作进度。

- 🌐 **在线 PWA 体验与安装**：[https://lenyli.github.io/WeeklyWorkReport/](https://lenyli.github.io/WeeklyWorkReport/)  
  *(支持在支持的环境中点击浏览器地址栏“安装”图标，添加到手机主屏幕或电脑桌面作为独立应用离线使用)*

---

## 核心功能

- 📝 **周报填写与草稿保护**：
  - 结构化录入：本周完成任务、下周工作规划、需协调与风险事项。
  - 支持多工作项动态增删与排序。
  - 自动暂存与草稿状态流转，避免输入丢失。
- 📊 **汇总与 Excel 导出**：
  - 管理端可一键查看本周期内周报的填报状态。
  - 支持将本周全员周报一键格式化导出为标准 Excel 表格（`.xlsx`），直接用于汇报存档。
- 📴 **离线可用 (PWA)**：
  - 内置 Service Worker，即便在会议室无网络环境下也能顺畅打开与记录。
- 🔒 **数据本地保存**：
  - 填报数据保存在浏览器本地，无任何数据上传行为。

---

## 本地使用说明

本项目为原生纯静态网页，开箱即用：

1. 克隆代码库：
   ```bash
   git clone https://github.com/lenyli/WeeklyWorkReport.git
   cd WeeklyWorkReport
   ```

2. 启动本地静态服务器：
   ```bash
   # 使用 Python 启动本地服务
   python3 -m http.server 3000
   ```

3. 在浏览器中访问 `http://localhost:3000` 即可直接使用。

> [!TIP]
> **使用注意**：数据均保存于当前浏览器的本地数据库中。如更换设备或清理浏览器网站数据，数据将无法保留，请每周导出 Excel 表格进行妥善备份。
