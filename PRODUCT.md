# LucentCue

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop application for Windows, macOS, and Linux, with a shared React interface inside Electron. Cross-platform packaging does not imply testing on every OS.

## Stack

Engineering recommendation under the user's request to be creative: TypeScript, React, Vite, Electron, and Playwright. Electron makes native shortcuts, screenshot capture, key storage, and browser tooling practical in the available Node environment. Its installer footprint is larger than Tauri's. Stack choice remains changeable.

## Users

People who want everyday desktop help with screenshots, coding, research, and browser assistance. This priority was explicitly confirmed by the user.

## Product Purpose

An easy-to-use desktop AI copilot summoned by a configurable shortcut, with free-model access and bring-your-own-key providers. Success means understandable controls, useful errors, responsive streaming, and a working core rather than promises of universal bug freedom.

## Operating Context

Personal desktop use; Windows is the available verification platform. The user selected personal OpenRouter keys first and preparation for a shared service later. Keys will be supplied later, so authenticated provider calls cannot yet be verified.

## Capabilities and Constraints

Requested: free OpenRouter models, provider keys entered in the UI, configurable show/hide and capture shortcuts, screenshot assistance, visible Playwright browser reading and field filling, local conversations, cross-platform builds. Free provider quotas and availability apply. Shared hosted access is future work; secrets must never ship in clients. Process hiding and monitoring evasion are outside this project.

## Brand Commitments

LucentCue is a working brand, with the proposed descriptive repository slug `lucentcue-desktop-ai`. The user asked for discoverability and a compelling open-source project. Stars, rankings, partnerships, and trademark availability cannot be promised.

## Evidence on Hand

Public Pluely README and historical license research; a supplied Windows installer available for static inspection. Current Pluely v1 is proprietary. This implementation is independently authored; no upstream source or binary code is copied. There are no user testimonials, traction metrics, verified speed benchmarks, or production releases yet.

## Product Principles

- Make one good question easy to ask from anywhere.
- Show what will leave the device before the user sends it.
- Free mode must never fall back to a paid model.
- Keep provider keys out of the renderer and out of releases.
- Browser actions stay visible and require a deliberate user action.

## Accessibility & Inclusion

Keyboard access, visible focus, readable contrast, reduced motion, and a usable compact window are implementation goals.
