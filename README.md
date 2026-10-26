<div align="center">

# Huawei PC marketing agent

**English** · [中文](README.zh-CN.md)

### An AI marketing workbench for Huawei retail staff

**From an idea to product-grounded copy and images—and on to customer follow-up.**

[Project guide PDF (中文)](项目说明书.pdf) · [Editable Word (中文)](项目说明书.docx) · [Feature and implementation guide (中文)](docs/作品说明书.md) · [Quick start](#quick-start)

</div>

![PC Studio unified conversation workspace](docs/说明书配图/统一对话工作台.png)

## What it helps retail staff do

“I want to recommend a laptop to people who travel frequently, but I haven't chosen a model.”

That is enough to start. PC Studio extracts the use case and audience from the conversation, recommends products with supporting reasons, helps staff confirm a model and platform, then generates copy, images, and traceable product references. When a customer begins asking questions, the same entry point can prepare price comparisons, objection responses, and follow-up drafts.

| Staff task | How PC Studio helps |
| --- | --- |
| Get started without a complete brief | Extract known information, ask only for important gaps, and offer options with reasons |
| Prepare content for different platforms | Plan and write with Skills for Xiaohongshu, WeChat Official Accounts, Moments, and other platforms |
| Add images to promotional copy | The main agent hands off a visual plan; an image sub-agent uses official assets to produce scene images |
| Learn products and check specifications | New-product updates and a knowledge base are accessible in one workspace; inline citations open the corresponding entries |
| Respond to customers and follow up | Compare identical configurations, prepare talking points and day 1/3/7 drafts, and create customer records when needed |

```mermaid
flowchart LR
    A[An idea] --> B[Understand needs and ask follow-up questions]
    B --> C[Confirm product and platform]
    C --> D[Copy and scene images]
    D --> E[Source checks and human review]
    E --> F[Customer questions and price comparison]
    F --> G[Follow-up drafts and customer records]
```

## Five decisions that make the work easier

### 01 No need to complete a form first

If staff have a specific model, content starts there. If they only have a scenario, the agent recommends products, explaining the link between usage habits, product features, and the recommendation before staff choose. The model plans the next questions; known information and confirmed choices enter session state and remain available for revision.

> **Try it:** I work in a Huawei store and want a Xiaohongshu post for consultants who travel frequently. Recommend a Huawei laptop for editing presentations, attending meetings, and carrying on trips. I haven't chosen a model—help me choose first.

### 02 Platform Skills differentiate the approach from the topic onward

The same feature can enter a Xiaohongshu post through an everyday activity, while a WeChat article needs a fuller explanation. Platform rules cover topics, titles, paragraph rhythm, interaction prompts, and tags, and are used in planning, writing, and review.

| Platform | Writing direction |
| --- | --- |
| Xiaohongshu / RedNote | Start with a self-contained everyday experience or point of view, then connect the product to readers' preferences; short paragraphs and natural emoji support a sharing tone |
| WeChat Official Accounts | Introduce a discussable judgment and develop it through reasoning and evidence, using the product as a concrete example |
| WeChat Moments | Concise, familiar retail communication that can lead into a customer conversation |
| Weibo / Douyin / Bilibili | Adjust information density, openings, and structure to the platform strategy |

Product facts are supported by citations. Accuracy rules apply during generation and validation, while the copy avoids repeatedly interrupting readers with defensive phrases such as “information not provided.”

Before writing, the inspiration flow reads the request, searches public sources, checks publication dates, and filters angles by platform, audience, and product for staff to choose. **Event-based topics** must connect directly to the product or the audience's actual needs. **Expression patterns** can borrow a fitting turn of phrase from unrelated contexts, such as food, without requiring the original topic to mention laptops.

A source with a verifiable date but unknown reach is labeled a recent expression reference. An undated source is labeled an expression reference with its date unverified. Only verifiable circulation evidence justifies a trending-meme label. Topic inspiration is not used as evidence for product facts. See the [inspiration workflow (中文)](docs/platform-inspiration-workflow.md).

### 03 An image sub-agent completes the visuals

The main agent sends the product, audience, platform, and visual plan to a separate image workflow. The sub-agent processes official assets, calls the image model, saves outputs, and returns results. It supports multiple scene images, subject to the task plan and backend limits.

- **Reference editing:** Use an official image of the same model to generate a different background and composition.
- **Background and subject compositing:** Generate a scene background, prepare a transparent product or cutout, and combine them.
- **Failure fallback:** Preserve warnings when an image fails or times out and fall back to official assets through the existing logic.

The following are saved outputs from actual project runs. All are **AI-generated creative images, not photographs**.

<table>
  <tr>
    <td width="33%"><img src="docs/说明书配图/案例1真实生成配图.png" alt="Travel-work Xiaohongshu image output" width="100%"></td>
    <td width="33%"><img src="docs/说明书配图/案例2真实生成配图.png" alt="Travel-work WeChat article image output" width="100%"></td>
    <td width="33%"><img src="docs/说明书配图/案例3真实生成配图.png" alt="University-student Xiaohongshu image output" width="100%"></td>
  </tr>
  <tr>
    <td><b>Travel work · Xiaohongshu</b><br>MateBook 14 Core Ultra<br>Packing a bag and working on the move</td>
    <td><b>Travel work · WeChat article</b><br>MateBook D 14 2024<br>Portability, reading, and meeting connections</td>
    <td><b>Back to university · Xiaohongshu</b><br>MateBook Pro S<br>Studying and moving between classrooms</td>
  </tr>
</table>

The [project guide (中文)](docs/作品说明书.md) includes excerpts, sources, and improvement notes. These historical cases use different models and are not a controlled experiment comparing platform styles.

### 04 Create content, learn products, and check evidence in one place

Conversation history preserves creative context. The workspace brings together customer records, an operating dashboard, new-product updates, and the product knowledge base. Staff can learn a product's positioning before writing and open the supporting knowledge entry from an inline citation whenever a specification needs checking.

**Product materials → retrieved evidence → inline citations → knowledge entries** connect content creation to product learning. Static facts come from the local Huawei PC v7 knowledge base; runtime use does not depend on ima cloud retrieval.

The finished-content toolbar offers a publication preview that simulates reading on platforms such as Xiaohongshu and WeChat. It helps check titles, text, and image placement. This is a local simulation; actual formatting depends on the destination platform.

### 05 Tools support the question: “Is it cheaper online?”

The conversion assistant uses budget, use cases, software requirements, and concerns to prepare recommendations and responses. After a product is selected, it compares identical configurations and generates day 1/3/7 follow-up drafts.

![Latest identical-configuration price comparison interface](docs/说明书配图/最新比价界面.png)

*Local demo screenshot from October 23, 2026. The public price of the configuration was ¥5,899 at query time. Prices change over time.*

- **Query official channels automatically:** Opening the panel or switching a configuration queries VMall product pages and the education section, checking operating system, memory, storage, and other configuration details.
- **Keep price sources distinct:** Historical store references, current public prices, education offers, and actual retail quotes have separate states. Unavailable amounts are not treated as confirmed discounts.
- **Calculate conditional offers:** Government-subsidy estimates depend on eligibility and policy conditions. Staff can enter a store quote for further comparison.
- **Follow up on actual blockers:** Day 1 fills key information gaps, day 3 progresses configuration and pricing, and day 7 closes the loop according to purchase status. Drafts adapt to the customer's situation.

Staff review and send the drafts. Ongoing tracking requires the customer's willingness to be contacted, sufficient information, and a customer record.

## How the custom agent supports the experience

PC Studio provides a retail-focused orchestration and runtime environment connecting need clarification, knowledge retrieval, platform Skills, the image sub-agent, validation, and conversion tools.

| Module | Engineering responsibility |
| --- | --- |
| Main agent | Recognize intent, identify gaps, plan questions, invoke capabilities, and organize results |
| Sessions and tasks | Store messages and state; manage jobs and progress across sessions |
| Knowledge and pricing tools | Supply product evidence, official assets, public same-configuration prices, and conditional discount calculations |
| Platform Skills | Apply platform writing conventions during planning, writing, and review |
| Image sub-agent | Execute reference editing or compositing from a visual plan and return outputs |
| Validation and tracing | Check structure, facts, and citations; record failed stages and request identifiers |

The custom implementation covers the business agent and its harness. Backend services call the underlying text and image models. Persisting chat history does not mean the model automatically learns long-term experience.

## Quick start

Node.js 22 is recommended. From the project root:

```powershell
npm --prefix services/api install
npm --prefix apps/web install
Copy-Item .env.example .env
```

Configure backend model services in the root `.env`:

```dotenv
LLM_BASE_URL=<compatible-api-base-url>
LLM_API_KEY=<text-model-key>
LLM_MODEL=<model-name-supported-by-your-provider>
IMAGE_PROVIDER=openai-next
IMAGE_BASE_URL=https://api.openai-next.com/v1/images/generations
CREDIT_MEDIA_API_KEY=<image-model-key>
IMAGE_MODEL=gpt-image-2
IMAGE_MAX_IMAGES=3
```

See [.env.example](.env.example) and the [image integration guide (中文)](docs/image-agent-integration.md) for all parameters. Configure credentials only on the backend.

Start the services in separate terminals:

```powershell
# Terminal 1: API
node scripts/start-api.cjs
```

```powershell
# Terminal 2: Web
npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5173
```

Open **http://127.0.0.1:5173/**. Public price queries require an available Edge or Chrome browser. Set `PRICE_BROWSER_EXECUTABLE` to a browser path in other environments.

## Two prompts to start a demonstration

The following prompts are English translations of the Chinese demo scenarios. The prototype targets Chinese retail content and platforms; English versions of generated copy and the interface have not been validated.

**Content creation:**

> Create a Xiaohongshu post with images for students starting university, focusing on taking a laptop to class and reading course materials. I haven't chosen a model. Recommend one with reasons first; after I choose, generate the copy and images.

**Conversion support:**

> I sell Huawei laptops in a retail store. A customer has a budget of ¥6,000–8,000, travels often, edits presentations and spreadsheets, and attends online meetings. They are concerned about compatibility with company plugins and want to compare online prices. Recommend a suitable product, prepare in-store responses, and draft day 1/3/7 follow-ups. Do not promise unverified compatibility or discounts.

## Documentation and structure

Supporting documents below are in Chinese unless indicated otherwise.

| Document | Contents |
| --- | --- |
| [PDF guide](项目说明书.pdf) / [Word](项目说明书.docx) | Features, five advantages, actual cases, and challenge requirements |
| [Project guide](docs/作品说明书.md) | Product explanation readable in the repository |
| [API constraints](接口约束.md) | Public API and field contracts |
| [Frontend interaction specification](docs/frontend-interaction-spec.md) | Workspace interaction and integration conventions |
| [Image sub-agent integration](docs/image-agent-integration.md) | Interfaces, assets, providers, and fallback boundaries |
| [Platform writing examples](docs/demo/platform-editorial-examples-2026-10-26.md) | Xiaohongshu, WeChat, and adapted expression examples with facts and sources labeled |
| [Public-channel pricing changes](docs/changes/2026-10-23-public-channel-prices.md) | Official price queries and conditional offer calculations |

```text
apps/web/              Unified conversation workspace
services/api/          Main agent, tool services, and image sub-agent
packages/shared/       Shared types and contracts
tests/                 Business and interface validation
docs/                  Product guides, demo images, and integration docs
scripts/               Startup and validation scripts
```

## Current boundaries

The repository retains the local knowledge-base directories required at runtime and the current project guides. Raw knowledge-base archives, old documents, internal review drafts, and customer records are excluded from version control. Customer records are created locally by the backend; model keys stay in local `.env` files or deployment environment variables.

This is an actively iterated hackathon project. Platform writing style and long-context quality still require systematic evaluation. Image editing can alter product details and requires human checks before publication. Public prices have query timestamps; education offers, government subsidies, and transaction prices depend on actual conditions. The operating dashboard summarizes internal records and does not establish attribution to external reach or sales.

The project addresses three organizer priorities: **accurate product representation, engaging content, and an experience simple enough for retail staff to use.** Current evidence consists of actual outputs and functional validation; it does not demonstrate measured gains in reach or conversion.
