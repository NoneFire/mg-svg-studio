#!/usr/bin/env python3
"""Compile the human-authored positive/negative review examples for Studio and CSV use."""

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/2026-11-07/quant-visual-review-正反例表-融合版.csv'
POSITIVE_SOURCE = ROOT / 'output/2026-11-07/quant-visual-review-正例表.csv'
CSV_OUTPUT = ROOT / 'output/2026-11-07/quant-visual-review-案例表.csv'
JSON_OUTPUT = ROOT / 'src/lib/review/examples.json'
FIELDS = [
    ('原则', 'principle'),
    ('来源类型', 'sourceType'),
    ('来源', 'source'),
    ('规则名称', 'ruleName'),
    ('案例类型', 'caseType'),
    ('案例说明', 'description'),
    ('判断', 'judgment'),
    ('所需证据', 'evidence'),
    ('规则计算公式', 'formula'),
    ('计算阈值', 'threshold'),
    ('阈值性质', 'thresholdKind'),
    ('适用条件与证据', 'scope'),
    ('计分轨道', 'scoringTrack'),
    ('规则满点', 'maxScore'),
    ('计分与提分口径', 'scoringGuidance'),
]

POSITIVE_FALLBACKS = {
    '同类组件尺寸档数': '同一断点下 8 个同状态工具栏按钮均使用同一固定尺寸档。K=1，N=8，频数为 8。INFO。符合项目声明的 1 档上限。',
    '同角色字距偏差': '同角色、同语言的正文使用项目参照字距 0em；每个排版运行段的附加字距均为 0px。s=0em，Δ=0em。INFO。与正文基线一致。',
    '局部密度热点': '三个等面积、同用途面板的可见内容占用率为 34%、35%、36%。Δ=36%−35%=1 个百分点。INFO。没有明显局部密度热点。',
    '强调色可见面积占比': '项目为主要操作区设置 10% 的强调色面积预算。任务区为 20000 面积单位，强调色可见并集为 1800。R=9%，低于预算 1 个百分点。INFO。',
    '文本区域占比': '项目为结账任务区设定 20%–30% 的文本足迹参考区间。任务区面积 20000，逐行文字足迹并集为 4800。R=24%，处于参考区间。INFO。',
}

# 正反例表用的是操作名，规则库用的是规则标题。同步时翻译，否则 Agent 用例取不到。
RULE_NAME_MAP = {
    '语义分组': '亲密性',
    '共同区域': '共同区域',
    '分块与层级': '分块数',
    '前景对比度': '文本对比度',
    '同类组件与样式一致性': '重复一致性',
    '间距节奏一致性': '间距体系',
    '排版档位预算': '字体系统',
    '色彩预算': '调色板',
    '对齐': '对齐',
    '网格对齐': '网格',
    '主次与视觉焦点': '层次排名',
    '信息噪音比': '信号噪音比',
    '视觉重量与留白': '平衡',
    '字号下限': '字号下限',
    '行长': '行长',
    '正文排版': '行高',
    '图形和标签的含义': '意义（形式追随功能）',
    '资源失效': '资源失效',
    '文本溢出': '文本溢出',
    '必要内容裁切': '出画 / 安全区',
    '必要内容遮挡': '文本遮挡',
}


def read_csv(path: Path):
    with path.open('r', encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))


def positive_text(row):
    parts = []
    for label, key in (
        ('正例场景', '正例场景'),
        ('测量示例', '测量示例'),
        ('符合原因', '符合原因'),
        ('适用条件', '适用条件与证据'),
    ):
        value = (row.get(key) or '').strip()
        if value:
            parts.append(f'{label}：{value}')
    return '\n'.join(parts)


def case_row(rule, kind, description):
    return {
        'principle': (rule.get('原则') or '').strip(),
        'sourceType': (rule.get('来源类型') or '').strip(),
        'source': (rule.get('来源') or '').strip(),
        'ruleName': RULE_NAME_MAP.get((rule.get('规则名称') or '').strip(), (rule.get('规则名称') or '').strip()),
        'caseType': kind,
        'description': description.strip(),
        'judgment': (rule.get('判断') or '').strip(),
        'evidence': (rule.get('所需证据') or '').strip(),
        'formula': (rule.get('规则计算公式') or '').strip(),
        'threshold': (rule.get('计算阈值') or '').strip(),
        'thresholdKind': (rule.get('阈值性质') or '').strip(),
        'scope': (rule.get('适用条件与证据') or '').strip(),
        'scoringTrack': (rule.get('计分轨道') or '').strip(),
        'maxScore': (rule.get('规则满点') or '').strip(),
        'scoringGuidance': (rule.get('计分与提分口径') or '').strip(),
    }


source_rows = read_csv(SOURCE)
if source_rows and '案例类型' in source_rows[0]:
    cases = [{
        'principle': (row.get('原则') or '').strip(),
        'sourceType': (row.get('来源类型') or '').strip(),
        'source': (row.get('来源') or '').strip(),
        'ruleName': (row.get('规则名称') or '').strip(),
        'caseType': (row.get('案例类型') or '').strip(),
        'description': (row.get('案例说明') or '').strip(),
        'judgment': (row.get('判断') or '').strip(),
        'evidence': (row.get('所需证据') or '').strip(),
        'formula': (row.get('规则计算公式') or '').strip(),
        'threshold': (row.get('计算阈值') or '').strip(),
        'thresholdKind': (row.get('阈值性质') or '').strip(),
        'scope': (row.get('适用条件与证据') or '').strip(),
        'scoringTrack': (row.get('计分轨道') or '').strip(),
        'maxScore': (row.get('规则满点') or '').strip(),
        'scoringGuidance': (row.get('计分与提分口径') or '').strip(),
    } for row in source_rows]
else:
    positive_rows = read_csv(POSITIVE_SOURCE)
    positive_by_name = {
        (row.get('规则名称') or '').strip(): row
        for row in positive_rows
        if (row.get('规则名称') or '').strip()
    }
    cases = []
    for rule in source_rows:
        rule_name = (rule.get('规则名称') or '').strip()
        positive = (rule.get('正例') or '').strip() or positive_text(positive_by_name.get(rule_name, {}))
        negative = (rule.get('反例') or '').strip()
        if positive:
            cases.append(case_row(rule, '正例', positive))
        if negative:
            cases.append(case_row(rule, '反例', negative))

for rule_name, description in POSITIVE_FALLBACKS.items():
    if not any(case['ruleName'] == rule_name and case['caseType'] == '正例' for case in cases):
        reference = next((case for case in cases if case['ruleName'] == rule_name), None)
        if reference:
            cases.append({**reference, 'caseType': '正例', 'description': description})

with CSV_OUTPUT.open('w', encoding='utf-8-sig', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=[label for label, _ in FIELDS])
    writer.writeheader()
    for case in cases:
        writer.writerow({label: case[key] for label, key in FIELDS})

# 合并：同 ruleName + caseType 用新表覆盖，其余旧用例保留
merged: dict[str, dict[str, dict]] = {}
if JSON_OUTPUT.exists():
    for item in json.loads(JSON_OUTPUT.read_text(encoding='utf-8')):
        merged.setdefault(item['ruleName'], {})[item['caseType']] = item
for case in cases:
    merged.setdefault(case['ruleName'], {})[case['caseType']] = {
        key: case[key] for key in ('principle', 'ruleName', 'caseType', 'description')
    }
prompt_examples = [item for group in merged.values() for item in group.values()]
JSON_OUTPUT.write_text(json.dumps(prompt_examples, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(prompt_examples)} example cases to {JSON_OUTPUT}（本次输入 {len(cases)} 条）')
