def test_package_importable() -> None:
    import tracer

    assert tracer.__name__ == "tracer"
